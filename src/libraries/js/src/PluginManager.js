// Managers
import { StateManager } from './ui/StateManager'
import {NodeEditor} from './utils/nodeEditor/NodeEditor'
import  {plugins} from '../brainsatplay'
import { Session } from './Session'

import { GUI } from 'dat.gui'

export class PluginManager{
    constructor(session, settings = {gui: true}){
        this.session = session

        // Two Modes
        this.applets = {}
        this.nodes = {}

        // Metadata
        this.settings = settings
        this.registry = {local: {}, brainstorm: {}}

        this.props = {
            toUnsubscribe: {
                stateAdded: [],
                stateRemoved: []
            },
            sequential: true
        }

        // Manage States Locally
        this.state = new StateManager()

        // Create GUI
        if (this.settings.gui === true){
            this.gui = new GUI({ autoPlace: false });
            document.body.innerHTML += `<div id="brainsatplay-plugin-gui" class='guiContainer'></div>`
            document.body.querySelector('.guiContainer').appendChild(this.gui.domElement);
            this.gui.domElement.style.display = 'none'
        }

    //     // Listen to Added/Removed States in Session (if provided)
    //     if (session instanceof Session){

    //         let added = (k) => {
    //             // Attach Proper Stream Callback to New Brainstorm States
    //             for (let s in this.registry.local){
    //                 let label = this.registry.local[s].label
    //                 if (this.registry.brainstorm[k] == null){
    //                         if (k.includes(label) && k !== label){
    //                             console.log(k,label)
    //                         // Only Defaults on the Brainstorm for Now
    //                         this.registry.brainstorm[k] = {count: 1, id: this.session.state.subscribeSequential(k, this.registry.local[s].registry['default'].callback), callback: this.registry.local[s].registry['default'].callback}
    //                         this.registry.brainstorm[k].callback()
    //                     }
    //                 } 
    //             }
    //         }

    //         let removed = (k) => {
    //             if (this.registry.brainstorm[k] != null){
    //                 this.session.state.unsubscribeSequential(k,this.registry.brainstorm[k].id)
    //                 this.registry.brainstorm[k].callback()
    //                 delete this.registry.brainstorm[k]
    //             }
    //         }

    //         this.props.toUnsubscribe['stateAdded'].push(this.session.state.subscribeSequential('stateAdded', added))
    //         this.props.toUnsubscribe['stateRemoved'].push(this.session.state.subscribeSequential('stateRemoved', removed))
    // }
    }

    instantiateNode(nodeInfo,session=this.session, activePorts=new Set(['default'])){
        let node = new nodeInfo.class(nodeInfo.id, session, nodeInfo.params)
        let controlsToBind = []

        // Set Default Parameters
        for (let param in node.paramOptions){
            if (node.params[param] == null) node.params[param] = node.paramOptions[param].default
        }

        // Add Default States
        node.states = {}

        if (node.ports != null){
            for (let port in node.ports){
                node.states[port] = [{}]
                let defaults = node.ports[port].defaults

                if (defaults && defaults.output) {
                    try {
                        if (Array.isArray(defaults.output)) node.states[port] = defaults.output
                        else if (defaults.output.constructor == Object && 'data' in defaults.output) node.states[port] = [defaults.output]
                    } catch {
                        node.states[port] = defaults.output
                    }
                }

                // Derive Control Structure
                let firstUserDefault= node.states[port][0]
                if (
                    node instanceof plugins.inputs.Event
                    // typeof firstUserDefault.data === 'number' || typeof firstUserDefault.data === 'boolean'
                    ){
                    let controlDict = {}
                    controlDict.format = typeof firstUserDefault.data
                    controlDict.label = this.getLabel(node,port) // Display Label
                    controlDict.target = {
                        state: node.states,
                        port: port
                    }
                    controlsToBind.push(controlDict)
                }
            }
        } else {
            node.ports = {}
        }

        activePorts.forEach(p => {

            // Add Ports Variable + Show If Active
            if (node.ports[p] == null) {
                node.ports[p] = {
                    defaults: {
                        output: [{}]
                    },
                    active: true
                }
            } else {
                node.ports[p].active = true
            }

            // Catch Active Ports without Default State Assigned
            if (node.states[p] == null) node.states[p] = [{}]
        })
        
        
        // Instantiate Dependencies
        let depDict = {}
        let instance;
        if (node.dependencies){
            node.dependencies.forEach(d => {
                ({instance} = this.instantiateNode(d))
                depDict[d.id] = instance
            })
        }
        node.dependencies = depDict

        return {instance: node, controls: controlsToBind}
    }

    add(id, name, graph){

        // Set Default Values for Graph
        let streams = new Set()
        let outputs = {}
        let subscriptions = {
            session: {},
            local: {}
        }
        let controls = {options: [], manager: this.state}
        let nodes = {}
        let edges = []
        let classInstances = {}

        if (this.applets[id] == null) this.applets[id] = {nodes, edges, name,streams, outputs,subscriptions, controls, classInstances}
        
        // Add Edges
        if (Array.isArray(graph.edges)){
            graph.edges.forEach(e => {
                this.applets[id].edges.push(e)

                // Capture Active Ports
                for (let k in e){
                    let [node,port] = e[k].split(':')
                    let nodeInfo = graph.nodes.find(o=>{
                        if (o.id === node){
                            return o
                        }
                    })
                    if (nodeInfo.activePorts == null) nodeInfo.activePorts = new Set()
                    if (port) nodeInfo.activePorts.add(port)
                }
            })
        }

        graph.nodes.forEach(nodeInfo => {
            this.addNode(id,nodeInfo)
        })
    }

    addNode(appId,nodeInfo){

        if (nodeInfo.id==null) nodeInfo.id = String(Math.floor(Math.random()*1000000))
        if (nodeInfo.activePorts==null) nodeInfo.activePorts = new Set()

        let instance,controls;
        if (this.applets[appId].nodes[nodeInfo.id] == null){
            this.applets[appId].nodes[nodeInfo.id] = nodeInfo;

            // Auto-Assign Default Port to Empty Set
            if (nodeInfo.activePorts.size == 0){
                nodeInfo.activePorts.add('default')
            }
            ({instance, controls} = this.instantiateNode(nodeInfo,this.session, nodeInfo.activePorts))
            this.applets[appId].nodes[nodeInfo.id].instance = instance;
            this.applets[appId].controls.options.push(...controls);
        }

        if (this.applets[appId].editor) this.applets[appId].editor.addNode(this.applets[appId].nodes[nodeInfo.id])
    }

    getNode(id,name){
        return this.applets[id].nodes[name].instance
    }

    updateParams(node,params) {
        for (let param in params) node.params[param] = params[param]
    }

    shallowCopy(input){

        let inputCopy = []
        input.forEach(u => {
            inputCopy.push(Object.assign({}, u))

        })
        return inputCopy
    }

    deepCopy(input){
        return JSON.parse(JSON.stringifyFast(input))
    }

    deeperCopy(input){
        let inputCopy = []

        input.forEach(u => {
            inputCopy.push(Object.assign({}, u))
            for (let key in u){
                if (u[key] != null && u[key].constructor == Object){
                    u[key] = Object.assign({}, u[key])
                }
            }
        })
        return inputCopy
    }

    getLabel(node,port){
        return (port != 'default') ? `${node.label}_${port}` : node.label
    }

    // Input Must Be An Array
    runSafe(node, port='default',input=[{}]){

        // Shallow Copy State before Repackaging
        let inputCopy = []

        inputCopy = this.deeperCopy(input)

        // Add Metadata
        for (let i = inputCopy.length - 1; i >= 0; i -= 1) {
            // Remove Users with Empty Dictionaries
            if (Object.keys(inputCopy[i]) == 0) inputCopy.splice(i,1)
            // Or Add Username
            else {
                if (!inputCopy[i].username) inputCopy[i].username = this.session?.info?.auth?.username
                if (!inputCopy[i].meta) inputCopy[i].meta = {}
            }
        }

        // Only Continue the Chain with Updated Data
        if (inputCopy.length > 0){
            
            let result
            if (node[port] instanceof Function) result = node[port](inputCopy)
            else if (node.states[port] != null) result = node['default'](inputCopy) 

            // Handle Promises
            if (!!result && typeof result.then === 'function'){
                result.then((r) =>{
                    this.checkToPass(node,port,r)
                })
            } else {
                this.checkToPass(node,port,result)
            }
        }

        return node.states[port]
    }

    checkToPass(node,port,result){
        if (result && result.length > 0){
            let allEqual = true
            result.forEach((o,i) => {
                if (node.states[port].length > i){
                    let thisEqual = JSON.stringifyFast(node.states[port][i]) === JSON.stringifyFast(o)
                    if (!thisEqual){
                        node.states[port][i] = o
                        allEqual = false
                    }
                } else {
                    node.states[port].push(o)
                    allEqual = false
                }
            })            
            if (!allEqual && node.stateUpdates){
                let updateObj = {}
                let label = this.getLabel(node,port)
                updateObj[label] = true
                node.stateUpdates.manager.setState(updateObj)
            }
        }
    }


    addToGUI(nodeInfo){
        // Add GUI Element for Newly Created Nodes

        let node = nodeInfo.instance

        let paramsMenu;
        
        if (node.paramOptions){
            let paramKeys = Object.keys(node.paramOptions)
            let toShow = false
            paramKeys.forEach(k => {
                if (node.paramOptions[k].show !== false){
                    toShow = true
                }
            })
            if (paramKeys.length > 0 && toShow){
            if (!Object.keys(this.gui.__folders).includes(node.label)){

                if (this.gui.domElement.style.display === 'none') this.gui.domElement.style.display = 'block'

                this.gui.addFolder(node.label);
                this.registry.local[node.label].gui[node.label] = []

                // Capitalize Display Name
                let splitName = node.label.split('_')
                splitName = splitName.map(str => str[0].toUpperCase() + str.slice(1))
                let folderName = splitName.join(' ')
                this.gui.__folders[node.label].name = folderName
            }
            paramsMenu = this.gui.__folders[node.label]
        }

        for (let param in node.paramOptions){
            if(typeof node.paramOptions[param] === 'object' && node.params[param] != null && node.paramOptions[param].show !== false){
                
                // Numbers and Text
                if (node.paramOptions[param].options == null){
                    this.registry.local[node.label].gui[node.label].push(
                        paramsMenu.add(
                            node.params, 
                            param, 
                            node.paramOptions[param].min,
                            node.paramOptions[param].max,
                            node.paramOptions[param].step)
                    );
                } 
                
                // Selector
                else if (node.paramOptions[param].options.length > 1) {
                    this.registry.local[node.label].gui[node.label].push(
                        paramsMenu.add(
                            node.params, 
                            param, 
                            node.paramOptions[param].options)
                    );
                }
            }
        }
    }
    }

    init(appId){

        let applet =  this.applets[appId]

        // Track UI Setup Variables
        let uiArray = []
        applet.uiParams = {
            HTMLtemplate: '',
            setupHTML: [],
            responsive: [],
        }

        let initializedNodes = []

        // Get UI Components from Nodes
        for (let id in applet.nodes){

            let node = applet.nodes[id]
            node.instance.stateUpdates = {}
            node.instance.stateUpdates.manager = this.state
            
            if (!initializedNodes.includes(node.id)){
                let ui = node.instance.init(node.params)
                if (ui != null) {

                    // Grab Responsive Function
                    ui.responsive = node.instance.responsive

                    // Pass Empty User Dictionary as Final Setup Call (overrides plugin defaults)
                    var cachedSetup = ui.setupHTML;
                    ui.setupHTML = (app) => {
                        cachedSetup(app)
                        let defaultInput = [{}]
                        for (let port in node.instance.ports){
                            let defaults = node.instance.ports[port].defaults
                            if (defaults){
                                if (defaults.input){
                                    defaultInput = defaults.input
                                    defaultInput.forEach(o => {
                                        if (o.data == null)  o.data = null
                                        if (o.meta == null)  o.meta = {}                           
                                    })
                                    node.instance[port](defaultInput)
                                }
                            }
                        }
                    }

                    // Push to UI Array
                    uiArray.push(ui)
                }
                initializedNodes.push(node.id)
            }
        }

        uiArray.forEach((o) => {
            if (o.HTMLtemplate instanceof Function) o.HTMLtemplate = o.HTMLtemplate()
            applet.uiParams.HTMLtemplate += o.HTMLtemplate
            applet.uiParams.setupHTML.push(o.setupHTML)
            applet.uiParams.responsive.push(o.responsive)
        })

        // Create All Nodes
        for (let id in applet.nodes){
            let nodeInfo =  applet.nodes[id]
            let node = nodeInfo.instance
            if (this.registry.local[node.label] == null){
                this.registry.local[node.label] = {label: node.label, count: 0, registry: {}, gui: {}}
                for (let port in node.states){
                    this.registry.local[node.label].registry[port] = {}
                    this.registry.local[node.label].registry[port].state = node.states[port]
                    this.registry.local[node.label].registry[port].callbacks = []
                }
            }
            if (applet.classInstances[nodeInfo.class.id] == null) applet.classInstances[nodeInfo.class.id] = {}
            applet.classInstances[nodeInfo.class.id][node.label] = []
            this.registry.local[node.label].count++
            this.addToGUI(nodeInfo)
        }

        // Create Edges
        applet.edges.forEach((e,i) => {
            this.addEdge(appId, e, false)
        })

        return applet
    }

    start(appId, sessionId){

        let applet =  this.applets[appId]
        applet.sessionId = sessionId ?? appId

        // Listen for Updates on Multiplayer Edges
        if (applet.sessionId != null){
            applet.edges.forEach((e,i) => {
                let splitSource = e.source.split(':')
                let sourcePort = splitSource[1] ?? 'default'
                let sourceInfo = applet.nodes[splitSource[0]]
                let splitTarget = e.target.split(':')
                if (applet.nodes[splitTarget[0]].instance instanceof plugins.utilities.Brainstorm) {
                    this._subscribeToBrainstorm(sourceInfo, appId, sourcePort)
                }
            })
        }

        return applet
    }
    addEdge = (appId, e) => {
        let applet = this.applets[appId]
        let splitSource = e.source.split(':')
        let sourceName = splitSource[0]
        let sourcePort = splitSource[1] ?? 'default'
        let sourceInfo = applet.nodes[sourceName]
        let source = sourceInfo.instance
        let splitTarget = e.target.split(':')
        let targetName = splitTarget[0]
        let targetPort = splitTarget[1] ?? 'default'
        let target = applet.nodes[targetName].instance
        let label = this.getLabel(source,sourcePort)
        let targetLabel = this.getLabel(target, targetPort)
        applet.classInstances[sourceInfo.class.id][source.label].push(label)

        // Pass Data from Source to Target
        let _onTriggered = (trigger) => {
            
            if (trigger){
                let input = source.states[sourcePort]
                input.forEach(u => {
                    u.meta.source = sourceName
                    u.meta.session = applet.sessionId
                })
                if (this.applets[appId].editor) this.applets[appId].editor.animate({label:source.label, port: sourcePort},{label:target.label, port: targetPort})
                return this.runSafe(target, targetPort, input)
            }
        }
        
        // Initialize port with Default Output
        this.state.data[label] = this.registry.local[sourceName].registry[sourcePort].state

        if (applet.nodes[targetName].instance instanceof plugins.utilities.Brainstorm) { // Register as a Brainstorm State
            applet.streams.add(label) // Keep track of streams to pass to the Brainstorm
            
            // Trigger Updates to Brainstorm State
            _onTriggered = (trigger) => {
                let input = source.states[sourcePort]
                input.forEach(u => {
                    u.meta.source = sourceName
                    u.meta.session = applet.sessionId
                })
                this.runSafe(applet.nodes[targetName].instance, 'send', input) // Send personal data
            }
        } 
        if (applet.nodes[sourceName].instance instanceof plugins.utilities.Brainstorm){ // Listen for Brainstorm Updates
            // NOTE: Limited to sending default output
            this.registry.local[sourcePort].registry['default'].callbacks.push((userData) => {
                this.runSafe(applet.nodes[sourceName].instance, sourcePort, [{data: true, meta: {source: sourcePort, session: applet.sessionId}}]) // Update port state
                _onTriggered(userData) // Trigger updates down the chain
            })
        }
        // else { //  Listen for Local Changes
        
            if (applet.subscriptions.local[label] == null) applet.subscriptions.local[label] = []
            let subId = this.state.subscribeSequential(label, _onTriggered)
            applet.subscriptions.local[label].push({id: subId, target: e.target})
        // }
    }

    findStreamFunction(prop) {
        return this.session.streamObj.streamTable.find((d => {
            if (d.prop === prop) {
                return d
            }             
        }))
     }

    stop(appId){
        let applet = this.applets[appId]

        // Remove Listeners
        Object.keys(applet.classInstances).forEach(classId => {
            let labels = Object.keys(applet.classInstances[classId])

            // Increment the Registry for Each Separate Label (of a particular class)
           
            labels.forEach(label => {

                let openPorts = applet.classInstances[classId][label]

                this.registry.local[label].count--

                if (this.registry.local[label].count == 0) {

                    // Remove GUI
                    for (let fname in this.registry.local[label].gui){
                        let folder = this.registry.local[label].gui[fname]
                        folder.forEach(o => {
                            o.remove()
                        })

                        let guiFolder = this.gui.__folders[fname]
                        guiFolder.close();
                        this.gui.__ul.removeChild(guiFolder.domElement.parentNode);
                        delete this.gui.__folders[fname];
                    }

                    // Hide GUI When Not Required
                    if (Object.keys(this.gui.__folders).length === 0){
                        if (this.gui.domElement.style.display !== 'none') this.gui.domElement.style.display = 'none'
                    }

                    // Remove Streaming
                    delete this.registry.local[label]
                    openPorts.forEach(p => {
                        this.session.removeStreaming(p);
                        this.session.removeStreaming(p, null, this.state, true);
                    })
                    this.session.removeStreaming(applet.sessionId);
                } else {
                    applet.edges.forEach(e => {
                        removeEdge(appId,e)
                    })
                }
            })
        })

        // Deinit Plugins
        for (let key in this.applets[appId].nodes){
            this.applets[appId].nodes[key].instance.deinit()
        }

        delete this.applets[appId]
    }

    removeEdge = (id, structure) => {

        let applet = this.applets[id]

        applet.edges.find((e,i) => {
            if (e === structure){
                this.applets[id].edges.splice(i,1)
                return true
            }
        })

        let stateKey = structure.source.replace(':', '_')

        let sessionSubs = applet.subscriptions.session[stateKey]
        let localSubs = applet.subscriptions.local[stateKey]

        if (sessionSubs != null){
            applet.subscriptions.session[stateKey].find(o =>{
                if (o.target === structure.target) {
                    this.session.removeStreaming(stateKey, o.id);
                    return true
                }
            })
        }
        if (localSubs != null){
            localSubs.find(o => {
                if (o.target === structure.target) {
                    this.session.removeStreaming(stateKey, o.id, this.state, true);
                    return true
                }
            })
        }
    }

    // Internal Methods
    _subscribeToBrainstorm(nodeInfo, appletId, port){
        let applet = this.applets[appletId]
        let id = (port != 'default') ? `${ nodeInfo.instance.label}_${port}` :  nodeInfo.instance.label

        if (applet.subscriptions.session[id] == null) applet.subscriptions.session[id] = []
        
        let found = this.findStreamFunction(id)

        if (found == null) {

            let _brainstormCallback = (userData) => {
                this.registry.local[id].registry[port].callbacks.forEach((f,i) => {
                    if (f instanceof Function) f(userData)
                })
            }

            // Create Brainstorm Stream
            let subId1 = this.session.streamAppData(id, this.registry.local[id].registry[port].state, applet.sessionId,_brainstormCallback) //()=>{}) // Local changes are already listened to
            applet.subscriptions.session[id].push({id: subId1, target: null})

            // Subscribe to Changes in Session Data
            let subId2 = this.session.state.subscribe(applet.sessionId, (sessionInfo) => {
                let data = [{data: true, meta: {source: id, session: applet.sessionId}}] // Trigger Brainstorm Update
                _brainstormCallback(data)
            })

            if (applet.subscriptions.session[applet.sessionId] == null) applet.subscriptions.session[applet.sessionId] = []
            applet.subscriptions.session[applet.sessionId].push({id: subId2, target: null})
        } 
    }

    // Create a Node Editor
    edit(applet, parentNode = document.body, onsuccess = () => { }){
        if (this.applets[applet.props.id]){
            this.applets[applet.props.id].editor = new NodeEditor(this, applet, parentNode, onsuccess)
            return this.applets[applet.props.id].editor
        }
    }

}