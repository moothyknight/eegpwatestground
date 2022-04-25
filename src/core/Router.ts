import StateManager from 'anotherstatemanager'
import { getRouteMatches } from '../common/general.utils'
import { randomId, pseudoObjectId, generateCredentials,  } from '../common/id.utils'
import { RouterOptions, AllMessageFormats, SocketConfig, FetchMethods, MessageObject, MessageType, RouteConfig, RouteSpec, UserObject } from '../common/general.types';
import { Service } from './Service';
import { getParamNames } from '../common/parse.utils';
import { SubscriptionService } from './SubscriptionService';
import errorPage from '../services/http/404'
import { Socket } from './Socket';
import { Graph } from './Graph';

export const DONOTSEND = 'DONOTSEND';
// export let NODE = false

// */ Router 
// A class for handling arbitrary commands (loaded from custom services)
// through networking protocols including HTTP, Websockets, OSC, and others.
//
// --------------- Route Structure ------------------
// **/
//  Default routes supplied by the Router.routes attribute
//
// */[service]
//  Additional core routes specified by services loaded into the session
//
// */[client_id]
//  Custom routes specified by clients (to implement...)
//


export class Router {
  id: string = randomId()


  // Method
  method = 'process'

  // Backend
  USERS: {[x:string]: UserObject} = {} //live message passing functions and basic user info
  CONNECTIONS: Map<string,{}> = new Map(); //threads or other servers
  SUBSCRIPTIONS: Function[] = [] // an array of handlers (from services)
  DEBUG: boolean;
  SOCKETS: {[x:string]:Socket} = {}

  SERVICES: {[x:string] : any} = {}

  ROUTES: {[x: string] : RouteConfig} = {} // Internal Routes Object
  INTERVAL=10;
  STATE:StateManager;

  DEFAULTROUTES = [
    {   
      route: 'ping',
      post:() => {
          return 'pong';
      }
  },
  {   
    route: 'echo',
    post:(self,graphOrigin,router,origin,...args) => {
        return args;
    }
},
  { //return a list of services available on the server
    route: 'services/**', 
    get: {
      object: this.SERVICES,
      transform: (reference, ...args) => {
        let dict = {};

        // Use First Argument
        let keys = (args.length > 0) ? [args[0]] : Object.keys(reference)
        keys.forEach(k => {
          const o = reference[k]
          if (o?.serviceType === 'default') dict[k] = o.name;
        })

        // Drill on Response
        args.forEach((v,i) => dict = dict[v])

        return dict;
      }
    },
  },
  { //return a list of function calls available on the server
    route: '/',
    aliases: ['routes/**'] ,
    get: {
      object: this.ROUTES,
      transform: (reference, ...args) => {
        let o = {}

        // Shift Arguments
        let keys = (args.length > 0) ? [args[0]] : Object.keys(reference)
        keys.forEach(key => {

          // Ensure Route Name Exists
          if (key && reference[key].route) o[key] = {
            route: reference[key].route.split('/').filter(str => !str.match(/\*\*?/)).join('/'),
            // args: reference[key].args,
            wildcard: key.includes('*')
          } // Shallow copy
        })

        // Auto-Drill on References
        args.forEach((v,i) => o = o[v])

        return o
      }
    }
  },
  { //generic send message between two users (userId, message, other data)
      route:'sendMessage',
      aliases:['message','sendMsg'],
      post:(self,graphOrigin,router,origin,...args)=>{
          return router.sendMsg(args[0],args[1],args[2]);
      }
  },
  { //set user details for yourRouter
      route:'setUserServerDetails',
      post:(self,graphOrigin,router,origin,...args)=>{
        let user = router.USERS[origin]
        if (!user) return false
        if(args[0]) user.username = args[0];
        if(args[1]) user.password = args[1];
        if(args[2]) user.props = args[2];
        if(args[3]) {
          user._id = args[3]; //not very wise to do in our schema
          user.id = args[3];
        } 
      }
  },
  { //assign user props for yourRouter or someone else (by user unique id)
      route:'setProps',
      post:(self,graphOrigin,router,origin,...args)=>{
        let user = router.USERS[origin]
        if (!user) return false
        if(typeof args === 'object' && !Array.isArray(args)) {
          Object.assign(user.props,args);
          return true;
        }
        else if (Array.isArray(args) && typeof args[1] === 'object') {
          let u = router.USERS[args[0]];
          if(u) Object.assign(u.props,args[1]);
          return true;
        }
        return false;
      }
  },
  { //get props of a user by id or of yourRouter
      route:'getProps',
      post:(self,graphOrigin,router,origin,...args)=>{
        let user = router.USERS[origin]
        if (!user) return false
  
        if(args[0]) {
          let u = router.USERS[args[0]];
          if(u) return u.props;
        }
        else return user.props;
      }
  },
  { //lists user keys
    route:'blockUser',
    post:(self,graphOrigin,router,origin,...args)=>{
      let user = router.USERS[origin]
      if (!user) return false
      return this.blockUser(user,args[0]);
    }
  },
  { //get basic details of a user or of your Router
    route: 'users/**',
    get: {
      object: this.USERS,
      transform: (o, ...args) => {

        let dict = {}
         // Use First Argument
         let keys = (args.length > 0) ? [args[0]] : Object.keys(o)
 
        keys.forEach(k => {
          const u = o[k]
            dict[k] = {
              _id:u._id,
              username:u.username,
              origin:u.origin,
              props:u.props,
              updatedPropNames:u.updatedPropNames,
              lastUpdate:u.lastUpdate,
              lastTransmit:u.lastTransmit,
              latency:u.latency
            }
      })

        // Drill References
        args.forEach((v,i) => dict = dict[v])

        return dict
      }
    }
  },
  { //get basic details of a user or of your Router
      route:'getUser',
      post:(self,graphOrigin,router,origin,...args)=>{
        let user = router.USERS[origin]
        if (!user) return false
  
        if(args[0]) {
          let u = this.USERS[args[0]]
          if(u) {
            return {
              _id:u._id,
              username:u.username,
              origin:u.origin,
              props:u.props,
              updatedPropNames:u.updatedPropNames,
              lastUpdate:u.lastUpdate,
              lastTransmit:u.lastTransmit,
              latency:u.latency
            }
          }
        }
        else {
          return {
            _id:user._id,
            username:user.username,
            origin:user.origin,
            props:user.props,
            updatedPropNames:user.updatedPropNames,
            lastUpdate:user.lastUpdate,
            lastTransmit:user.lastTransmit,
            latency:user.latency
          }
        }
      }
  },
  {
    route:'login',
    aliases:['addUser', 'startSession'],
    post: async (self,graphOrigin,router,origin,...args) => {
      //console.log('logging in', args);
      const u = await router.addUser(args[0])
      return { message: u, id: u.origin }
    }
  },
  {
    route:'logout',
    aliases:['removeUser','endSession'],
    post:(self,graphOrigin,router,origin,...args) => {
      let user = router.USERS[origin]
        if (!user) return false
      if(args[0]) router.removeUser(...args)
      else router.removeUser(user);
    }
  },
  ]

  subscription?: SubscriptionService // Single Subscription per Router (to a server...)

  protocols: {
      http?: SubscriptionService
      websocket?: SubscriptionService
  } = {}

  // -------------------- User-Specified Options --------------------

    constructor(options: RouterOptions = {debug: false}) {
		
        if(options.interval) this.INTERVAL = options.interval;

        this.STATE = new StateManager(
          {},
          this.INTERVAL,
          undefined //false
        );

        this.DEBUG = options?.debug

        // Browser-Only
        if ('onbeforeunload' in globalThis){
          globalThis.onbeforeunload = () => {

            Object.values(this.SOCKETS).forEach(e => {if (e.type != 'webrtc') this.logout(e)}) // TODO: Make generic. Currently excludes WebRTC
          }
        }

        // Load Default Routes
        this.load({routes: this.DEFAULTROUTES})

        if(this.DEBUG) this.runCallback('routes', [true])

        if (options?.sockets) options.sockets.forEach(e => this.connect(e))
    }

    // -----------------------------------------------
    // 
    // Frontend Methods (OG)
    // 
    // -----------------------------------------------
    connect = (config:SocketConfig, onconnect?:Function) => {
      let socket = new Socket(config, this.SERVICES, this)
      // Register User and Get Available Functions
      this.SOCKETS[socket.id] = socket;
      socket.check().then(res => {
          if (res) {
            if (onconnect) onconnect(socket);
            this.login(socket, socket.credentials); // Login user to connect to new remote
          }
      })
      return socket;
  }

  disconnect = async (id) => {
    this.logout(this.SOCKETS[id]);
    delete this.SOCKETS[id];
  }


  private _loadBackend = (service: Service|SubscriptionService, name:string=service.name) => {
    
    this.SERVICES[name] = service
    this.SERVICES[name].status = true

    service.routes?.forEach(o => this.addRoute(Object.assign({service: name}, o)))


    if (service.subscribe) {
      service.subscribe(async (o:MessageObject, type?:MessageType, origin?:string|undefined) => {
        let res = await this.handleMessage(o, type);
        if(origin?.includes('worker')) { 
          if(res !== null && service[origin]) service[origin].postMessage({route:'worker/workerPost', message:res, origin:service.id, callbackId:o.callbackId})
          else return res;
        }
        return res;
      })
    }

    if (service?.serviceType === 'subscription') this.SUBSCRIPTIONS.push((service  as SubscriptionService).updateSubscribers)
  }

  private _loadService = async (service: Service, name=service?.name) => {
    this._loadBackend(service, name) // Load a backend Service
    return this._loadClient(service, name, true) // Load a client Service but skip waiting to resolve the remote name
  }

  private _loadClient = (service: Service, _?, onlySubscribe=false) => {

      return new Promise(resolve => {

          // let worker = false;
          // if(name.includes('worker')) worker = true;
          const name = service.name

          // NOTE: This is where you listen for service.notify()
          if (service.subscribe){
            service.subscribe(async (o:MessageObject, type:MessageType) => {

 
                // Check if Service is Available
                const client = this.SERVICES[name]
                const available = client.status === true

                let res;
                  if (type === 'local'){
                    res = await this.handleLocalRoute(o)
                  } else if (available) {
                    res = await this.send({
                      route: `${client.route}/${o.route}`,
                      socket: service?.socket // If remote is bound to client
                    }, ...o.message ?? []) // send automatically with extension
                }

                return res
            })
          }

          if (onlySubscribe) resolve(service)
          else {
    
            // Load Client Handler
            this.SERVICES[name] = service 
    
              const toResolve = (route) => {
                this.SERVICES[name].status = true
    
                if (service.setSocketRoute instanceof Function) service.setSocketRoute(route)
    
                  // Expect Certain Callbacks from the Service
                  service.routes.forEach(o => {
                      o.service = route // assign service name
                      this.addRoute(o)
                  })
                  
                  resolve(service)
              }
    
              // Don't Resolve Unless Matching Service at Socket...
              if (this.SERVICES[name].status === true) toResolve(name)
              else this.SERVICES[name].status = toResolve;
            }
    

      })

  }

  async login(socket?:Socket, user?:Partial<UserObject>) {

    await this.logout(socket);

    //console.log('logging in')

    const arr = Object.values((socket) ? {socket} : this.SOCKETS)
    
    let res = await Promise.all(arr.map(async (socket) => {
      
      let res = await this.send({
        route: 'login',
        socket
      }, user);

      //console.log('logging in res', res)
      //console.log('Resolved from server', res[0])
      socket.setCredentials(res[0]);
      return res;
    }))

    //console.log('Res', res)
    if(res) return res[0];
    return res.reduce((a,b) => a*b[0], true) === 1
  }

  async logout(socket?:Socket) {

    const res = await Promise.all(Object.values((socket) ? {socket} : this.SOCKETS).map(async (socket) => {
      const res = await this.send({
        route: 'logout',
        socket
      }, socket.credentials)

      return res
    }))

    //console.log('Res', res)
    if (!res) return false
    return res.reduce((a,b) => a*b?.[0], true) === 1
  }
  
  get = (routeSpec:RouteSpec, ...args:any[]) => {
    return this._send(routeSpec, 'GET', ...args)
  }

  delete = (routeSpec:RouteSpec, ...args:any[]) => {
    return this._send(routeSpec, 'DELETE', ...args)
  }

  post = (routeSpec:RouteSpec, ...args:any[]) => {
    return this._send(routeSpec, 'POST', ...args)
  }

  send = this.post


  private _send = async (routeSpec:RouteSpec, method?: FetchMethods, ...args:any[]) => {
    
      let socket;
      if (typeof routeSpec === 'string' || routeSpec?.socket == null) socket = Object.values(this.SOCKETS)[0]
      else socket = routeSpec.socket
      
      if (!socket) return

      let response;      
      response = await socket.send(routeSpec, {
        message: args, 
        method
      })

      if (response) this.handleLocalRoute(response, socket)

      // Pass Back to the User
      return response?.message

  }

  // NOTE: Client can call itself. Server cannot.
  handleLocalRoute = async (o:MessageObject, socket?: Socket, route?: string) =>{

    // Notify through Subscription (if not suppressed)
    if (socket && route && !o.suppress && socket.connection) socket.connection?.service?.responses?.forEach(f => f(Object.assign({route}, o))) // Include send route if none returned

    // Activate Internal Routes if Relevant (currently blocking certain command chains)
    if (!o.block) {
      let route = this.ROUTES[o?.route]

      if (this.method === 'process'){
        if (route?.post instanceof Graph) {
          return route.post.run(...([this, o.id, ...(o.message ?? [])]));
        }
      } else {
        if (route?.post instanceof Function) {
             return await route.post(undefined, undefined, this, o.id, ...(o.message ?? []));
        }
      }
    }
  }

  subscribe = async (callback: Function, options: {
      protocol?:string
      routes?: string[]
      socket?: Socket,
      force?:boolean
  } = {}) => {

      if (Object.keys(this.SOCKETS).length > 0 || options?.socket) {
          if (!options.socket) options.socket = Object.values(this.SOCKETS)[0]
          const res = await options.socket._subscribe(options).then(res => options.socket.subscribe(callback))
          return res
      } else throw 'Remote is not specified'

  }

    // -----------------------------------------------
    // 
    // Backend Methods (OG)
    // 
    // -----------------------------------------------


    async load(service:any, name:string = service.name) {

      let isClient = service.constructor.type === 'client'
      let isService =  !service.constructor.type || service.constructor.type === 'service' // Includes objects
      let isBackend =  service.constructor.type === 'backend'


    if (isService) await this._loadService(service, name)

    // Add as Backend
    if (isBackend) await this._loadBackend(service, name)

    // Add as Client
    if (isClient) await this._loadClient(service)
      
    return service


    }

    format(o:any, info: {
      service?: string,
      headers?: {[x:string]:string}
    } = {}) {

      if (o !== undefined){ // Can pass false and null
          if (!o || !(typeof o === 'object') || (!('message' in o) && !('route' in o))) o = {message: o}
          if (!Array.isArray(o.message)) o.message = [o.message]
          if (info.service && o?.route) o.route = `${info.service}/${o.route}` // Correct Route
          // if (routeInfo.get) state.setState(route, res.message)
          if (info.headers) o.headers = info.headers // e.g. text/html for SSR
      }

      // Remove Wildcards
      if (o?.route) o.route = o.route.replace(/\/\*\*?/, '')

      return o
    }


    async runRoute(route, method: FetchMethods, args:any[]=[], origin, callbackId?) {

      try { //we should only use try-catch where necessary (e.g. auto try-catch wrapping unsafe functions) to maximize scalability
        if(route == null) return; // NOTE: Now allowing users not on the server to submit requests
        if (!method && Array.isArray(args)) method = (args.length > 0) ? 'POST' : 'GET'
        if(this.DEBUG) console.log('route', route);


          return await this.runCallback(route, (args as any), origin, method).then((dict:MessageObject|any) => {
            
            if(this.DEBUG) console.log(`Result:`, dict);

            // Convert Output to Message Object
            if (dict === undefined) return
            else {
              dict = this.format(dict)
              // if (!dict.route) dict.route = route // Only send back a route when you want to trigger inside the Router
              if (callbackId) dict.callbackId = callbackId

              if (this.ROUTES[dict.route]) dict.block = true // Block infinite command chains... 

              // Pass Out
              if(dict.message === DONOTSEND) return;
              return dict;
            }
          }).catch(console.error)
      } catch (e) {
        return new Error(`Route failed...`)
      }
  }

  // Track Users Connected to the brainsatplay Live Server
  addUser(userinfo:Partial<UserObject> = {}, credentials:Partial<UserObject> = generateCredentials(userinfo)) {

    //console.log('Trying to add', userinfo, credentials)
    if (userinfo) {
      
      // Get Current User if Exists
      const u = this.USERS[credentials._id] // Reference by credentials
      // Grab Base
      let newuser: UserObject = u ?? {
        _id: userinfo._id ?? userinfo.id, //second reference (for mongodb parity)
        id:userinfo.id ?? userinfo._id,
        username: userinfo.username,
        origin: credentials._id,
        props: {},
        updatedPropNames: [],
        sessions:[],
        blocked:[], //blocked user ids for access controls
        lastUpdate:Date.now(),
        lastTransmit:0,
        latency:0,
        routes: new Map(),
      };

      Object.assign(newuser,userinfo); //assign any supplied info to the base

      if(this.DEBUG) console.log('Adding User, Id:', userinfo._id, 'Credentials:', credentials);

      this.USERS[credentials._id] =  newuser;

      //add any additional properties sent. remote.service has more functions for using these
      for (let key in this.SERVICES){
            const s = this.SERVICES[key]
            if (s.status === true){
              const route = s.name + '/users' // Default Route
              const possibilities = getRouteMatches(route)
              possibilities.forEach(r => {
                if (this.ROUTES[r]) {
                  this.runRoute(r, 'POST', [newuser], credentials._id) 
                }
              })
            }
      }
      //console.log('ADDED USER',newuser)
      return newuser; //returns the generated id so you can look up
    } else return false
  }

  removeUser(user:string|UserObject) {
    let u = (typeof user === 'string') ? this.USERS[user] : user
    
    if(u) {

        Object.values(this.SERVICES).forEach(s => {
          if (s.status === true){
            const route = s.name + '/users'
            if (this.ROUTES[route]) this.runRoute(route, 'DELETE', [u], u.id)
          }
        })

        delete u.id
        return true;
    } 
    return false;
  }

  //adds an id to a blocklist for access control
  blockUser(user:UserObject, userId='') {
    if(this.USERS[userId]) {
      if(!user.blocked.includes(userId) && user.id !== userId) { //can't block Router 
        user.blocked.push(userId);
        return true;
      }
    }
    return false;
  }

  handleMessage = async (msg:AllMessageFormats, type?:MessageType) => {

    let o:Partial<MessageObject> = {}

    if (Array.isArray(msg)) { //handle commands sent as arrays [username,cmd,arg1,arg2]
      o.route = msg[0]
      o.message =  msg.slice(1)
      o.callbackId =  undefined
      // o.id = socketId
    }
    else if (typeof msg === 'string') { //handle string commands with spaces, 'username command arg1 arg2'
        let cmd = msg.split(' ');
        o.route = cmd[0]
        o.message =  cmd.slice(1)
        o.callbackId =  undefined
        // o.id = socketId
    } else if (typeof msg === 'object') Object.assign(o, msg)

    // Deal With Object-Formatted Request
    if(typeof o === 'object' && !Array.isArray(o)) { //if we got an object process it as most likely user data
            
      if(o.route != null) {
        
        console.log('runRoute', o.route)

        // TODO: Allow Server to Target Remote too
        // let res
        // if (type === 'local'){
        //   res = await this.runRoute(o.route, o.method, o.message, u?.id ?? o.id, o.callbackId);
        //   if (o.suppress) res.suppress = o.suppress // only suppress when handling messages here
        // } else {
          const res = await this.runRoute(o.route, o.method, o.message, o._id ?? o.id, o.callbackId);
          if (res && o.suppress) res.suppress = o.suppress // only suppress when handling messages here
        // }
        
        return res;
      }
    }
    return null;

  }
  
  //pass user Id or object
  sendMsg(user:string|UserObject='',message='',data=undefined) {

      //let toSend = (data) ? Object.assign(data, { message }) : { message }
      let toSend = {message:message, data:data};

      if(typeof user === 'string') {
        //console.log(user, message, data);
          let u = this.USERS[user];
          if(typeof u === 'object') {
            if(typeof u?.send === 'function') {
              u.send(toSend)
              return true
            } else console.log("\x1b[31m", `[BRAINSATPLAY] ${user} does not have anything to receive your message...`)
          } else console.log("\x1b[31m", `[BRAINSATPLAY] ${user} does not have anything to receive your message...`)
      } else if (user && typeof user === 'object') {
        if(typeof user.send !== 'function' && user._id) { user = this.USERS[user._id] }
        if (typeof user.send === 'function') {
          user.send(toSend);
          return true;
        } else console.log("\x1b[31m", `[BRAINSATPLAY] ${user.username ?? user.id} does not have anything to receive your message...`)
      }
      return false;
  }

    addRoute(o: RouteConfig) {
      o = Object.assign({}, o)

      const cases = [o.route, ...(o.aliases) ? o.aliases : []]
      delete o.aliases

      cases.forEach(route => {
            if(!route || (!o.post && !o.get)) return false;
            route = o.route = `${(o.service) ? `${o.service}/` : ''}` + route
            this.removeRoute(route); //removes existing callback if it is there
            if (route[0] === '/') route = route.slice(1)

            // --------------- Graph Support ---------------
            if (this.method === 'process'){
              if (o.post && !(o.post instanceof Graph)) o.post = new Graph({tag: route, operator: o.post}) // Map to process
            }

            this.ROUTES[route] = Object.assign(o, {route})
            
            if (o.get) {

              // Subscribe to Base Route // TODO: Doube-check that subscriptions are working
              this.STATE.setState({[route]: o.get?.object ?? o.get});

              this.STATE.subscribe(route, (data) => {

                const message = (o.get?.transform) ? o.get.transform(data, ...[]) : data
                
                this.SUBSCRIPTIONS.forEach(o =>{
                  return o(this, {
                    route, 
                    message
                  })
              })
            })
          }
        })
        return true;
    }

    removeRoute(functionName) {
        return delete this.ROUTES[functionName]
    }

    runCallback(
      route,
      input=[],
      origin?,
      method=(input.length > 0) ? 'POST' : 'GET',
    ) {

      return new Promise(async resolve => {
        // Get Wildcard Possibilities
        let possibilities = getRouteMatches(route)

        let errorRes = {route, block: true, message: {html: errorPage}, headers: {'Content-Type': 'text/html'}} // NOTE: Do not include route unless you want it to be parsed as a command

        // Iterate over Possibilities
        Promise.all(possibilities.map(async possibleRoute => {

          let routeInfo = this.ROUTES[possibleRoute]

          if (routeInfo) {

            if(this.DEBUG) console.log('routeInfo', routeInfo);


            try {
              let res;

              const postGraph = (this.method === 'process') ? routeInfo?.post instanceof Graph : routeInfo?.post instanceof Function

              // Delete Handler
               if (routeInfo?.delete && method.toUpperCase() === 'DELETE') {
                res  = await routeInfo.delete(this, origin, ...input)
              } 
              
              // Get Handler
              else if (method.toUpperCase() === 'GET' || !postGraph) {
                const value = this.STATE.data[routeInfo.route] // Get State by route

                if (value){
                  
                  // Get argsuments after main route
                  const args = route.replace(routeInfo.route.split('/').filter(a => a != '*' && a != '**').join('/'), '').split('/').filter(str => !!str)
                  res = {message: (routeInfo.get?.transform) ? await routeInfo.get.transform(value, ...args) : value}
                } else res = errorRes
              }
              // Post Handler
              else if (postGraph) {
                // res  = await (routeInfo.post as Function)(null, this, origin, ...(input ?? []))
                res  = (this.method === 'process') ? await (routeInfo.post as Graph).run(...([this, origin, ...(input ?? [])])) : await (routeInfo.post as Function)(null, this, origin, ...(input ?? []))
              } 

              // Error Handler
              else res = errorRes
              resolve(this.format(res, routeInfo))

            } catch(e) {
              console.log('Callback Failed: ', e)
            }
          }
        })).then(_ => resolve(errorRes))
      })
    }

    async checkRoutes(event) {
        if(!event.data) return;
        let route = this.ROUTES[event.data.foo] ?? this.ROUTES[event.data.route] ?? this.ROUTES[event.data.functionName]
        if (!route) route = this.ROUTES[event.data.foo]
        if (route){
                if (this.method === 'process'){
                  if (event.data.message && route.post instanceof Graph) {
                    return await route.post.run(...([this, event.data.origin, ...(event.data.message ?? [])]));
                  } else return
                } else {
                  if (event.data.message && route.post instanceof Function) {
                    return await route.post(undefined, undefined, this, event.data.origin, ...(event.data.message ?? []));
                  } else return
                }
        } else return false
    }
}

export default Router