
/* TODO
Security - e.g. regex control so scripts can't be pumped in
Data capping. This needs to be implemented Clientside as well so the socket doesnt get used at all for overly large data. Test limits, consider server costs
Maybe buffer new data instead (up to a few hundred samples maybe) and instead of a newData call use a counter to know how much data to send to each subscription. That way no data is lost if updates
    are faster than subscriptions. 
    //By Joshua Brewster, Garrett Flynn (GPL)
*/

class DataServer { 
       /**
     * @constructor
     * @alias DataServer
     * @description Class for managing incoming requests to the WebBCI server.
     */

    constructor(appnames=[]) {
		this.userData=new Map();
		this.serverInstances=appnames;
		this.userSubscriptions=[]; //User to user data subscriptions
		this.gameSubscriptions=[]; //Synchronous games (all players receive each other's data)
        this.hostSubscriptions=[]; //Asynchronous games (host receives all users data data, users receive host data only)
        this.subUpdateInterval = 0; //ms
        this.serverTimeout = 60*60*1000; //min*s*ms
        this.mongodb;

        this.subscriptionLoop();
	}

	addUser(username='',appname='',socket=null,availableProps=[]) {

        socket = this.setWSBehavior(username, socket)
        
        if (!this.userData.has(username)){
            this.userData.set(username, {
                username:username,
                appname:appname,
                socket:socket,
                props: {},
                updatedPropnames: [],
                lastUpdate:Date.now(),
                lastTransmit:0,
                latency:0
            })
            availableProps.forEach((prop,i) => {
                this.userData.get(username).props[prop] = '';
            });
        }
        else { 
            let u = this.userData.get(username);
            u.lastUpdate = Date.now();
            u.appname = appname;
            if(socket.url !== u.socket.url) { //handle same user on new port
                u.socket.close();
                u.socket = socket;
            }
            availableProps.forEach((prop,i) => {
                u.props[prop] = '';
            });
        }
    }

    getUserData(username='') {
        return this.userData.get(username);
    }
    
    setWSBehavior(username, socket){
        if (socket != null){
            socket.on('message', (s) => {
                this.processMessage(s);
            });

            socket.on('close', (s) => {
                this.removeUser(username)
            });
        }
        return socket
    }

    removeUser(username='username') {
        this.userData.delete(username)
    }

    removeUserToUserStream(listener,source,propnames=null) { //delete stream or just particular props
        let found = false;
        let sub = this.userSubscriptions.find((o,i)=>{
            if(o.listener === listener && o.source === source) {
                if(!Array.isArray(propnames)) this.userSubscriptions.splice(i,1);
                else {
                    propnames.forEach((prop) => {
                        let pidx = o.propnames.indexOf(prop);
                        if(pidx > -1) {
                            o.propnames.splice(pidx);
                        }
                    })
                }
                found = true;
                return true;
            }
        });
        return found;
    }

    removeUserFromGame(id='',username='') {
        let found = false;
        let sub = this.gameSubscriptions.find((o,i) => {
            if(o.id === id) {
                let uidx = o.usernames.indexOf(username);
                if(uidx > -1) o.usernames.splice(uidx,1);
                let sidx = o.spectators.indexOf(username);
                if(sidx > -1) o.spectators.splice(sidx,1);
                found = true;
                return true;
            }
        });

        if(!found) {
            let sub = this.hostSubscriptions.find((o,i) => {
                if(o.id === id) {
                    let uidx = o.usernames.indexOf(username);
                    if(uidx > -1) o.usernames.splice(uidx,1);
                    let sidx = o.spectators.indexOf(username);
                    if(sidx > -1) o.spectators.splice(sidx,1);
                    found = true;
                    return true;
                }
            });
        }

        return found;
    }

    removeGameStream(appname='') {
        let found = false;
        let sub = this.gameSubscriptions.find((o,i) => {
            if(o.appname === appname) {
                this.gameSubscriptions.splice(i,1);
                found = true;
                return true;
            }
        });
        return found;
    }

    processMessage(msg='') {
        let parsed = JSON.parse(msg);
        if(typeof parsed === 'object' && !Array.isArray(parsed)) { //if we got an object process it as most likely user data
            let hasData = false;
            for(const prop in parsed) {
                if(prop === 'userData') {
                    hasData = true;
                    break;
                }
            }
            if(hasData) {
                this.updateUserData(parsed);
            }
            else if(parsed.username && parsed.cmd) {
                this.processUserCommand(parsed.username,parsed.cmd);
            }
           
        }
        else if (Array.isArray(parsed)) { //handle commands sent as arrays [username,cmd,arg1,arg2]
            this.processUserCommand(parsed[0],parsed.slice(1));  
        }
        else if (typeof parsed === 'string') { //handle string commands with spaces, 'username command arg1 arg2'
            let cmd = parsed.split(' ');
            this.processUserCommand(cmd[0],cmd.slice(1));
        }
    }

    
    processUserCommand(username='',commands=[]) { //Commands should be an array of arguments 
        let u = this.userData.get(username);
        if (u != null) u.lastUpdate = Date.now();
        //u.socket.send(JSON.stringify({msg:commands}));
        if(commands[0] === 'getUsers') {
            let users = [];
            this.userData.forEach((o) => {
                if(commands[1] !== undefined) {
                    if(o.username === commands[1]) {
                        users.push(o);
                    }
                }
                else if(u.appname !== '' && o.appname === u.appname) {
                    users.push(o.username);
                }
                else {
                    users.push(o.username);
                }
            });
            if(users.length > 0) u.socket.send(JSON.stringify({msg:'getUsersResult', userData:users}))
            else u.socket.send(JSON.stringify({msg:'userNotFound', userData:[username]}))
        }
        else if(commands[0] === 'getUserData') {
            if(commands[2] === undefined) {
                let u2 = this.getUserData(commands[1]);
                if(u2 === undefined) { u.socket.send(JSON.stringify({msg:'userNotFound',username:commands[1]})); }
                else {u.socket.send(JSON.stringify({msg:'getUserDataResult',username:commands[1],props:u2.props})); }
            }
            else if (Array.isArray(commands[2])) {
                let d = this.getUserData(commands[1]).props;
                let result = {msg:'getUserDataResult',username:commands[1],props:{}};
                if(d === undefined) { u.socket.send(JSON.stringify({msg:'userNotFound',username:commands[1]})); }
                else {
                    commands[2].forEach((prop)=> {update[props][prop] = d.props[prop]});
                    u.socket.send(JSON.stringify(result)); 
                }
            }
        }
        else if (commands[0] === 'createGame') {
            let i = this.createGameSubscription(commands[1],commands[2],commands[3]);
            u.socket.send(JSON.stringify({msg:'gameCreated',appname:commands[1],gameInfo:this.gameSubscriptions[i]}));
        }
        else if (commands[0] === 'getGames') { //List games with the app name
            let subs = this.getGameSubscriptions(commands[1]);
            if(subs === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGamesResult',appname:commands[1],gameInfo:subs}));
            }
        }
        else if (commands[0] === 'getGameInfo') { //List the game info for the particular ID
            let sub = this.getGameSubscription(commands[1]);
            if(sub === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGameInfoResult',appname:commands[1],gameInfo:sub}));
            }
        }
        else if (commands[0] === 'getGameData') {
            let gameData = this.getGameData(commands[1]);
            if(gameData === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGameDataResult',appname:commands[1],gameData:gameData}));
            }
        }
        else if (commands[0] === 'createHostedGame') {
            let i = this.createHostSubscription(commands[1],commands[2],commands[3],commands[4],commands[5]);
            u.socket.send(JSON.stringify({msg:'gameCreated',appname:commands[1],gameInfo:this.hostSubscriptions[i]}));
        }
        else if (commands[0] === 'getHostGames') { //List games with the app name
            let subs = this.getHostSubscriptions(commands[1]);
            if(subs === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGamesResult',appname:commands[1],gameInfo:subs}));
            }
        }
        else if (commands[0] === 'getHostGameInfo') { //List the game info for the particular ID
            let sub = this.getHostSubscription(commands[1]);
            if(sub === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGameInfoResult',appname:commands[1],gameInfo:sub}));
            }
        }
        else if (commands[0] === 'getHostGameData') {
            let gameData = this.getHostGameData(commands[1]);
            if(gameData === undefined) {
                u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));
            }
            else {
                u.socket.send(JSON.stringify({msg:'getGameDataResult',appname:commands[1],gameData:gameData}));
            }
        }
        else if(commands[0] === 'subscribeToUser') {  //User to user stream
            if(commands[3]) this.streamBetweenUsers(commands[1],commands[2],commands[3]);
            else this.streamBetweenUsers(commands[1],commands[2]);
        }
        else if(commands[0] === 'subscribeToGame') { //Join game
            this.subscribeUserToGame(commands[1],commands[2],commands[3]);
        }
        else if(commands[0] === 'subscribeToHostGame') { //Join game
            this.subscribeUserToHostGame(commands[1],commands[2],commands[3],commands[4]);
        }
        else if(commands[0] === 'unsubscribeFromUser') {
            let found = undefined;
            if(commands[2]) found = this.removeUserToUserStream(commands[1],commands[2],commands[3]);
            else found = this.removeUserToUserStream(commands[1],commands[2]);
            if(found) {  u.socket.send(JSON.stringify({msg:'unsubscribed',username:commands[2],props:commands[3]}));}
            else { u.socket.send(JSON.stringify({msg:'userNotFound'}));}
        } 
        else if (commands[0] === 'logout') {
            u.socket.send(JSON.stringify({msg:'logged out'}));
            u.socket.close();
            this.userData.delete(username);
        }
        else if(commands[0] === 'leaveGame') {
            let found = undefined;
            if(commands[2]) found = this.removeUserFromGame(commands[1],commands[2]);
            else found = this.removeUserFromGame(commands[1],u.username);
            if(found) {  u.socket.send(JSON.stringify({msg:'leftGame',appname:commands[1]}));}
            else { u.socket.send(JSON.stringify({msg:'gameNotFound',appname:commands[1]}));}
        }
        else if(commands[0] === 'deleteGame') {
            let found = this.removeGameStream(commands[1]);
            if(found) { u.socket.send(JSON.stringify({msg:'gameDeleted',appname:commands[1]}));}
            else { u.socket.send(JSON.stringify({msg:'gameNotFound'}));}
        }
        else if( commands[0] === 'ping' || commands === 'ping') {
            u.socket.send(JSON.stringify({msg:'pong'}))
        }
    }

	//Received a message from a user socket, now parse it into system
	updateUserData(data={username:'',userData:{}}){ 

		//Send previous data off to storage
        if (this.userData.has(data.username)){

            let u = this.userData.get(data.username);

            for(const prop in data.userData) {
                u.props[prop] = data.userData[prop];
                if(u.updatedPropnames.indexOf(prop) < 0)
                    u.updatedPropnames.push(prop);
            }

            let now = Date.now();
            u.latency = now-u.lastUpdate;
            u.lastUpdate = now;

            this.userSubscriptions.forEach((o,i) => {
                if(o.source === data.username) {
                    o.newData = true;
                }
            });

            this.gameSubscriptions.forEach((o,i) => {
                if(o.usernames.indexOf(data.username) > -1 && o.updatedUsers.indexOf(data.username) < 0 && o.spectators.indexOf(data.username) < 0) {
                    o.updatedUsers.push(data.username);
                }
            });

            this.hostSubscriptions.forEach((o,i) => {
                if(o.usernames.indexOf(data.username) > -1 && o.updatedUsers.indexOf(data.username) < 0 && o.spectators.indexOf(data.username) < 0) {
                    o.updatedUsers.push(data.username);
                }
            });

            //o.socket.send(JSON.stringify(o.props));
            
        }
	}

	streamBetweenUsers(listenerUser,sourceUser,propnames=[]) {
        let idx = undefined;
        let sub = this.userSubscriptions.find((o,i) => {
            if(o.listener === listenerUser && o.source === sourceUser) {
                idx = i;
                o.propnames = propnames;
                return true;
            }
        });
        if(sub === undefined) {
            let source = this.userData.get(sourceUser);
            if(propnames.length === 0) {
                for(const propname in source.props) {
                    propnames.push(propname);
                }
            }
            let u = this.userData.get(listenerUser);
            if(u !== undefined && source !== undefined) {
                this.userSubscriptions.push({
                    listener:listenerUser,
                    source:sourceUser,
                    id:sourceUser+"_"+Math.floor(Math.random()*10000000),
                    propnames:propnames,
                    newData:false,
                    lastTransmit:0
                });
                u.socket.send(JSON.stringify({msg:'subscribedToUser', sub:this.userSubscriptions[this.userSubscriptions.length-1]}))
                return this.userSubscriptions[this.userSubscriptions.length-1];
            }
            else {
                u.socket.send(JSON.stringify({msg:'userNotFound', username:sourceUser}));
            }
            
        }
        else { 
            return idx;
        }
	}

	createGameSubscription(appname='',devices=[],propnames=[]) {
        // this.mongodb.db("brainsatplay").collection('apps').find({ name: appname }).count().then(n => {
        //     if (n > 0){
                this.gameSubscriptions.push({
                    appname:appname,
                    devices:devices,
                    id:appname+"_"+Math.floor(Math.random()*10000000),
                    usernames:[],
                    updatedUsers:[], //users with new data available (clears when read from subcription)
                    newUsers:[], //indicates users that just joined and have received no data yet
                    spectators:[], //usernames of spectators
                    propnames:propnames,
                    lastTransmit:Date.now()
                });
            // } else {
            //     console.log('error: game not configured.')
            // }
        // });

        return this.gameSubscriptions.length - 1;
	}

	getGameSubscriptions(appname='') {
		let g = this.gameSubscriptions.filter((o) => {
            if(o.appname === appname) return true;
        })
        if(g.length === 0) return undefined;
		else return g;
	}

    getGameSubscription(id='') {
		let g = this.gameSubscriptions.find((o,i) => {
			if(o.id === id) {
				return true;
			}
		});
        return g;
	}

    getGameData(id='') {
        let gameData = undefined;
        let s = this.gameSubscriptions.find((sub,i) => {
            if(sub.id === id) {
                let updateObj = {
                    msg:'gameData',
                    appname:sub.appname,
                    devices:sub.devices,
                    id:sub.id,
                    propnames:sub.propnames,
                    usernames:sub.usernames,
                    updatedUsers:sub.updatedUsers,
                    newUsers:sub.newUsers,
                    userData:[],
                    spectators:[]
                };
                
                sub.usernames.forEach((user,j) => { //get current relevant data for all players in game
                    if(sub.spectators.indexOf(user) < 0){
                        let userObj = {
                            username:user
                        }
                        let listener = this.userData.get(user);
                        if(listener) {
                            sub.propnames.forEach((prop,k) => {
                                userObj[prop] = listener.props[prop];
                            });
                            updateObj.userData.push(userObj);
                        }
                    }
                    else {
                        spectators.push(user);
                    }
                });
                gameData = updateObj;
                return true;
            }
        });
        return gameData;
    }

	subscribeUserToGame(username,id,spectating=false) {
		let g = this.getGameSubscription(id);
        let u = this.userData.get(username);
		if(g !== undefined && u !== undefined) {
            if( g.usernames.indexOf(username) < 0) { 
                g.usernames.push(username);
                if(spectating === true) g.spectators.push(username);
                g.newUsers.push(username);
                g.updatedUsers.push(username);
            }
			
			g.propnames.forEach((prop,j) => {
				if(!(prop in u.props)) u.props[prop] = '';
			});
            u.appname = id;
			//Now send to the user which props are expected from their client to the server on successful subscription
			u.socket.send(JSON.stringify({msg:'subscribedToGame',appname:id,gameInfo:g}));
		}
		else {
			u.socket.send(JSON.stringify({msg:'gameNotFound',appname:id}));
		}
	}

    createHostSubscription(appname='',devices=[],propnames=[], hostname='', hostprops=[]) {
        this.hostSubscriptions.push({
            appname:appname,
            devices:devices,
            id:appname+"_"+Math.floor(Math.random()*10000000),
            hostname:hostname,
            hostprops:hostprops,
            usernames:[],
            updatedUsers:[], //users with new data available (clears when read from subcription)
            newUsers:[], //indicates users that just joined and have received no data yet
            spectators:[], //usernames of spectators
            propnames:propnames,
            lastTransmit:Date.now()
        });

        return this.hostSubscriptions.length-1;
    }

    getHostSubscriptions(appname='') {
		let g = this.hostSubscriptions.filter((o) => {
            if(o.appname === appname) return true;
        })
        if(g.length === 0) return undefined;
		else return g;
	}

    getHostSubscription(id='') {
		let g = this.hostSubscriptions.find((o,i) => {
			if(o.id === id) {
				return true;
			}
		});
        return g;
	}

    getHostGameData(id='') {
        let gameData = undefined;
        let s = this.gameSubscriptions.find((sub,i) => {
            if(sub.id === id) {
                let updateObj = {
                    msg:'gameData',
                    appname:sub.appname,
                    devices:sub.devices,
                    id:sub.id,
                    hostname:sub.hostname,
                    hostprops:sub.hostprops,
                    propnames:sub.propnames,
                    usernames:sub.usernames,
                    updatedUsers:sub.updatedUsers,
                    newUsers:sub.newUsers,
                    hostData:{},
                    userData:[],
                    spectators:[]
                };
                
                sub.usernames.forEach((user,j) => { //get current relevant data for all players in game
                    if(sub.spectators.indexOf(user) < 0){
                        let userObj = {
                            username:user
                        }
                        let listener = this.userData.get(user);
                        if(listener) {
                            sub.propnames.forEach((prop,k) => {
                                userObj[prop] = listener.props[prop];
                            });
                            updateObj.userData.push(userObj);
                        }
                    }
                    else {
                        spectators.push(user);
                    }
                });

                let host = this.userData.get(sub.hostname);
                if(host) {
                    sub.hostprops.forEach((prop,j) => {
                        updateObj.hostData[prop] = host.props[prop];
                    })
                }

                gameData = updateObj;
                return true;
            }
        });
        return gameData;
    }

	subscribeUserToHostGame(username,id,spectating=false,hosting=false) {
		let g = this.getHostSubscription(id);
        let u = this.userData.get(username);
		if(g !== undefined && u !== undefined) {
            if( g.usernames.indexOf(username) < 0) { 
                g.usernames.push(username);
                if(spectating === true) g.spectators.push(username);
                g.newUsers.push(username);
            }

            if(hosting === true) g.hostname = username;
			
			g.propnames.forEach((prop,j) => {
				if(!(prop in u.props)) u.props[prop] = '';
			});
			//Now send to the user which props are expected from their client to the server on successful subscription
			u.socket.send(JSON.stringify({msg:'subscribedToGame',appname:appname,devices:g.devices,propnames:g.propnames,hostname:g.hostname,hostprops:g.hostprops}));
		}
		else {
			u.socket.send(JSON.stringify({msg:'gameNotFound',appname:appname}));
		}
	}

    updateUserSubscriptions = (time) => {
        this.userSubscriptions.forEach((sub,i) => {
            //Should create a dispatcher that accumulates all user and game subscription data to push all concurrent data in one message per listening user
            if(time - sub.lastTransmit > this.subUpdateInterval){
                let listener = this.userData.get(sub.listener);
                let source = this.userData.get(sub.source);

                if(listener === undefined || source === undefined ) {
                    this.userSubscriptions.splice(i,1);
                }
                else if(sub.newData === true) {
                    let dataToSend = {
                        msg:'userData',
                        username:sub.source,
                        id:sub.id,
                        userData:{}
                    };
                    sub.propnames.forEach((prop,j) => {
                        if(source.updatedPropnames.indexOf(prop) > -1)
                            dataToSend.userData[prop] = source.props[prop];
                    });
                    sub.newData = false;
                    sub.lastTransmit = time;
                    listener.socket.send(JSON.stringify(dataToSend));
                }
            }
		});
    } 

    updateGameSubscriptions = (time) => {
        this.gameSubscriptions.forEach((sub,i) => {
            if(time - sub.lastTransmit > this.subUpdateInterval){
                
                //let t = this.userData.get('guest');
                //if(t!== undefined) t.socket.send(JSON.stringify(sub));

                let updateObj = {
                    msg:'gameData',
                    appname:sub.appname,
                    devices:sub.devices,
                    id:sub.id,
                    propnames:sub.propnames,
                    usernames:sub.usernames,
                    spectators:sub.spectators,
                    updatedUsers:sub.updatedUsers,
                    newUsers:sub.newUsers,
                    userData:[],
                };

                if(sub.newUsers.length > 0) { //If new users, send them all of the relevant props from other users

                    let fullUserData = [];

                    sub.usernames.forEach((user, j) => {
                        if(sub.spectators.indexOf(user) < 0) {
                            let userObj = {
                                username:user
                            }
                            let listener = this.userData.get(user);
                            if(listener){ 
                                sub.propnames.forEach((prop,k) => {
                                    userObj[prop] = listener.props[prop];
                                });
                                fullUserData.push(userObj);
                            }
                        }
                    });

                    let fullUpdateObj = Object.assign({},updateObj);

                    fullUpdateObj.userData = fullUserData;

                    sub.newUsers.forEach((user, j) => {
                        let u = this.userData.get(user);
                        if(u !== undefined) u.socket.send(JSON.stringify(fullUpdateObj));
                        else {
                            sub.usernames.splice(sub.usernames.indexOf(user),1);
                            if(sub.spectators.indexOf(user) > -1) {
                                sub.spectators.splice(sub.spectators.indexOf(user),1);
                            }
                        }
                    });

                }
                
                if(sub.updatedUsers.length > 0) { //only send data if there are updates
                    sub.updatedUsers.forEach((user,j) => {
                        if(sub.spectators.indexOf(user) < 0){
                            let userObj = {
                                username:user
                            }
                            let listener = this.userData.get(user);
                            if(listener.props.devices) userObj.devices = listener.props.devices;
                            if(listener) {
                                sub.propnames.forEach((prop,k) => {
                                    if(listener.updatedPropnames.indexOf(prop) > -1)
                                        userObj[prop] = listener.props[prop];
                                });
                                updateObj.userData.push(userObj);
                            }
                        }
                    });

                    sub.usernames.forEach((user,j) => {
                        if(sub.newUsers.indexOf(user) < 0) { //new users will get a different data struct with the full data from other users
                            let u = this.userData.get(user);
                            if(u !== undefined) {
                                u.socket.send(JSON.stringify(updateObj));
                                u.lastUpdate = time; //prevents timing out for long spectator sessions
                            } else {
                                sub.usernames.splice(sub.usernames.indexOf(user),1);
                                if(sub.spectators.indexOf(user) > -1) {
                                    sub.spectators.splice(sub.spectators.indexOf(user),1);
                                }
                            }
                        }
                    });

                }
                
                sub.updatedUsers = [];
                sub.newUsers = [];
            }
            sub.lastTransmit = time;
		});
    }

    updateHostGameSubscriptions = (time) => {
        this.hostSubscriptions.forEach((sub,i) => {
            if(time - sub.lastTransmit > this.subUpdateInterval){
                
                //let t = this.userData.get('guest');
                //if(t!== undefined) t.socket.send(JSON.stringify(sub));

                let updateObj = {
                    msg:'gameData',
                    appname:sub.appname,
                    devices:sub.devices,
                    id:sub.id,
                    hostname:sub.hostname,
                    hostprops:sub.hostprops,
                    propnames:sub.propnames,
                    usernames:sub.usernames,
                    spectators:sub.spectators,
                    updatedUsers:sub.updatedUsers,
                    newUsers:sub.newUsers,
                    hostData:{},
                    userData:[],
                };

                
                let hostUpdateObj = Object.assign({},updateObj);

                let host = this.userData.get(sub.hostname);
                if(host) {
                    sub.hostprops.forEach((prop,j) => {
                        updateObj.hostData[prop] = host.props[prop];
                    });
                }

                if(host) {
                    if(sub.updatedUsers.length > 0) { //only send data if there are updates
                        sub.updatedUsers.forEach((user,j) => {
                            if(sub.spectators.indexOf(user) < 0 && sub.newUsers.indexOf(user) < 0){
                                let userObj = {
                                    username:user
                                }
                                let listener = this.userData.get(user);
                                if(listener.props.devices) userObj.devices = listener.props.devices;
                                if(listener) {
                                    sub.propnames.forEach((prop,k) => {
                                        if(listener.updatedPropnames.indexOf(prop) > -1)
                                            userObj[prop] = listener.props[prop];
                                    });
                                    hostUpdateObj.userData.push(userObj);
                                }
                            }
                        });
                    }

                    sub.newUsers.forEach((user,j) => {
                        if(sub.spectators.indexOf(user) < 0){
                            let userObj = {
                                username:user
                            }
                            let listener = this.userData.get(user);
                            if(listener) {
                                sub.propnames.forEach((prop,k) => {
                                    userObj[prop] = listener.props[prop];
                                });
                                hostUpdateObj.userData.push(userObj);
                            }
                        }
                    });

                    host.socket.send(JSON.stringify(hostUpdateObj));
                }

                //send latest host data to users
                sub.usernames.forEach((user,j) => {
                    let u = this.userData.get(user);
                    if(u !== undefined) {
                        u.socket.send(JSON.stringify(updateObj));
                        u.lastUpdate = time; //prevents timing out for long spectator sessions
                    } else {
                        sub.usernames.splice(sub.usernames.indexOf(user),1);
                        if(sub.spectators.indexOf(user) > -1) {
                            sub.spectators.splice(sub.spectators.indexOf(user),1);
                        }
                    }
                });

                sub.updatedUsers = [];
                sub.newUsers = [];
                
            }
            sub.lastTransmit = time;
		});
    }

	subscriptionLoop = () => {
        let time = Date.now();
        //Should have delay interval checks for each subscription update for rate limiting
        this.updateUserSubscriptions(time);

        //optimized to only send updated data
		this.updateGameSubscriptions(time);

        //optimized to only send updated data
		this.updateHostGameSubscriptions(time);

        this.userData.forEach((u,i) => {
            u.updatedPropnames = [];
            if(time - u.lastUpdate > this.serverTimeout) {
                this.userData.socket.close();
                this.userData.delete(u.username);
            }
        })

		setTimeout(() => {this.subscriptionLoop();},10);
    }

}

module.exports = DataServer