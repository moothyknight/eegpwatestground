import {Graph} from './Graph'
import {LiveEditor} from '../../ui/LiveEditor'
import { DOMFragment } from '../../ui/DOMFragment'
import  {plugins} from '../../../brainsatplay'
import  {Plugin} from '../../plugins/Plugin'

export class GraphEditor{
    constructor(manager, applet, parentId) {
        this.manager = manager
        this.app = applet
        this.plugins = this.manager.applets[this.app.props.id]
        this.parentNode = document.getElementById(parentId)
        this.element = null
        this.graph=null
        this.shown = false
        this.scale = 1
        this.searchOptions = []
        this.classRegistry = {}

        this.props = {
            id: String(Math.floor(Math.random()*1000000)),
        }
    
        if (this.plugins){

            // Only One Editor (look three levels up)
            let existingEditor = this.parentNode.querySelector(`.brainsatplay-node-editor`)
            if (!existingEditor && this.parentNode.parentNode) existingEditor = this.parentNode.parentNode.querySelector(`.brainsatplay-node-editor`)
            if (!existingEditor && this.parentNode.parentNode.parentNode) existingEditor = this.parentNode.parentNode.parentNode.querySelector(`.brainsatplay-node-editor`)
            if (existingEditor) existingEditor.remove()

            let template = () => {
                return `
                <div id="${this.props.id}GraphEditorMask" class="brainsatplay-default-container brainsatplay-node-editor">
                    <div id="${this.props.id}MainPage">
                        <div id="${this.props.id}ViewTabs" class="brainsatplay-node-editor-tabs">
                        </div>
                        <div id="${this.props.id}NodeViewer" class="brainsatplay-node-viewer">
                        </div>
                    </div>
                    <div id="${this.props.id}GraphEditor" class="brainsatplay-node-sidebar">
                        <div>
                            <div class='node-sidebar-section'>
                                <h3>0.1. Project Info</h3>
                            </div>
                            <div class='node-sidebar-header'>
                                <h4>Settings</h4>
                            </div>
                            <div id="${this.props.id}settings" class='node-sidebar-content'>
                            </div>
                            <div class='node-sidebar-content' style="display: flex; flex-wrap: wrap; padding: 10px;">
                                <button id="${this.props.id}download" class="brainsatplay-default-button">Download Project</button>
                                <button id="${this.props.id}reload" class="brainsatplay-default-button">Reload Project</button>
                                <button id="${this.props.id}save" class="brainsatplay-default-button">Save Project</button>
                            </div>
                            <div class='node-sidebar-section'>
                                <h3>0.2. Node Editor</h3>
                                <button id="${this.props.id}add" class="brainsatplay-default-button">+</button>
                            </div>
                            <div class='node-sidebar-header'>
                                <h4>Parameters</h4>
                            </div>
                            <div id="${this.props.id}params" class='node-sidebar-content'>
                            <p></p>
                            </div>
                        </div>
                        <div>
                            <div class='node-sidebar-header'>
                                <h4>Interactions</h4>
                            </div>
                            <div id="${this.props.id}params" class='node-sidebar-content' style="display: flex; flex-wrap: wrap; padding-top: 10px;">
                                <button id="${this.props.id}edit" class="brainsatplay-default-button">Edit Node</button>
                                <button id="${this.props.id}delete" class="brainsatplay-default-button">Delete Node</button>
                                </div>
                            </div>
                    </div>
                </div>
                `
            }
    
            let setup = async () => {
                this.container = document.getElementById(`${this.props.id}GraphEditorMask`)

                // Setup Presentation Based On Settings
                if (this.app.info.editor.style) this.container.style = this.app.info.editor.style 
                setTimeout(() => {
                    let toggleClass = '.brainsatplay-default-editor-toggle'
                    
                    // Search for Toggle
                    let toggle = this.app.AppletHTML.node.querySelector(toggleClass)
                    if (!toggle && this.app.AppletHTML.node.parentNode) toggle = this.app.AppletHTML.node.parentNode.querySelector(toggleClass)
                    if (!toggle && this.app.AppletHTML.node.parentNode.parentNode) toggle = this.app.AppletHTML.node.parentNode.parentNode.querySelector(toggleClass)
                    if (this.app.info.editor.toggleId) {
                        toggle = document.getElementById(this.app.info.editor.toggleId)
                    }
                    
                    if (toggle) toggle.addEventListener('click', () => {this.toggleDisplay()})
                    else console.warn('toggle not available')
                }, 500)

                this.mainPage = document.getElementById(`${this.props.id}MainPage`)
                this.sidebar = document.getElementById(`${this.props.id}GraphEditor`)
                document.getElementById(`${this.props.id}edit`).style.display = 'none'
                document.getElementById(`${this.props.id}delete`).style.display = 'none'

                let download = document.getElementById(`${this.props.id}download`)
                download.onclick = () => {
                    this.app.session.projects.download(this.app)
                }

                let save = document.getElementById(`${this.props.id}save`)
                save.onclick = () => {
                    this.app.session.projects.save(this.app)
                }

                let reload = document.getElementById(`${this.props.id}reload`)
                reload.onclick = () => {
                    applet.reload()
                }

                this.viewer = document.getElementById(`${this.props.id}NodeViewer`)

                // Add Settings Editor
                this.createSettingsEditor(applet.info)

                // Scale View of Graph
                this.viewer.addEventListener('wheel', (e)=>{
                    this.scale += 0.01*-e.deltaY
                    if (this.scale < 0.3) this.scale = 0.3 // clamp
                    if (this.scale > 1.5) this.scale = 1.5 // clamp

                    this.viewer.style['-moz-transform'] = `scale(${this.scale}, ${this.scale})`; /* Moz-browsers */
                    this.viewer.style['zoom'] = this.scale; /* Other non-webkit browsers */
                    this.viewer.style['zoom'] = `${this.scale*100}%` /* Webkit browsers */

                    for (let key in this.graph.nodes){
                        this.graph.nodes[key].updateAllEdges()
                    }
                })
                
                // Search for Plugins
                this.createPluginSearch(this.mainPage)

                // Create Tabs
                this.createViewTabs()

                // Populate Used Nodes and Edges
                this.graph = new Graph(this.plugins, this.viewer)
                await this.graph.initEdges()

                // Add Click Events
                for (let key in this.graph.nodes){
                    let node = this.graph.nodes[key]
                    this.addPortEvents(node)
                    this.addNodeEvents(node)
                }

                // Add Edge Reactivity
                this.graph.edges.forEach(e => {
                    this.addEdgeReactivity(e)
                })
            }
    
            this.element = new DOMFragment(
                template,
                this.parentNode,
                undefined,
                setup
            )
        }


        window.addEventListener('resize', this.responsive)

    }

    _onMouseOverEdge = (e) => {
        e.node['curve'].style.opacity = 0.3
    }

    _onMouseOutEdge = (e) => {
        e.node['curve'].style.opacity = 1
    }
    _onClickEdge = (e) => {
        this.removeEdge(e)
    }

    addEdgeReactivity = (e) => {
        e.node['curve'].addEventListener('mouseover', () => {this._onMouseOverEdge(e)})
        e.node['curve'].addEventListener('mouseout', () => {this._onMouseOutEdge(e)})
        e.node['curve'].addEventListener('click', () => {this._onClickEdge(e)})
    }

    createViewTabs = () => {

        let parentNode = document.getElementById(`${this.props.id}ViewTabs`)

        // Add Tab Div
        let tabs = document.createElement('div')
        tabs.classList.add('tab')
        parentNode.insertAdjacentElement('afterbegin', tabs)

        // Add Tabs
        this.addTab('Graph Editor', this.viewer.id)
    }

    addTab(label, id=String(Math.floor(Math.random()*1000000)), onOpen=()=>{}){
        let tab = document.querySelector(`[data-target="${id}"]`);

        if (tab == null){
            tab = document.createElement('button')
            tab.classList.add('tablinks')
            tab.setAttribute('data-target', id)
            tab.innerHTML = label

            let allTabs =  document.querySelector('.tab').querySelectorAll('.tablinks')
            tab.onclick = () => {
                // Close Other Tabs
                let allTabs =  document.querySelector('.tab').querySelectorAll('.tablinks')
                for (let otherTab of allTabs){
                    let tabId = otherTab.getAttribute('data-target')
                    let target = document.getElementById(tabId)
                    if(id != tabId) {
                        if (target) target.style.display = 'none'
                        otherTab.classList.remove('active')
                    } else {
                        if (target) target.style.display = ''
                        otherTab.classList.add('active')
                        onOpen()
                        this.responsive()
                    }
                }
            }
            document.querySelector('.tab').insertAdjacentElement('beforeend', tab)
            this.responsive()
        }
        tab.click()
    }

    createSettingsEditor(settings){
            let settingsContainer = document.getElementById(`${this.props.id}settings`)
            // settingsContainer.innerHTML = ''
            Object.keys(settings).forEach(key => {
                let restrictedKeys = ['image', 'editor','devices', 'categories', 'instructions', 'graph', 'intro', 'display']
                if (restrictedKeys.includes(key)){

                    switch(key){
                        case 'intro':
                            settings.intro = {
                                title: false
                            }
                            return
                        case 'display':
                            settings.display = {
                                production: false
                            }
                            return
                        case 'devices':
                            // Handle internally
                            return
                    }
                    
                } else {
                    let containerDiv = document.createElement('div')
                    containerDiv.insertAdjacentHTML('beforeend',`<div><p>${key}</p></div>`)
                    let inputContainer = document.createElement('div')
                    inputContainer.style.position = 'relative'    
                    let input = document.createElement('input')
                    input.type = 'text'
                    input.value = settings[key]

                    // Change Live Params with Input Changes
                    input.oninput = (e) => {
                        settings[key] = input.value
                    }
                    // Add to Document
                    inputContainer.insertAdjacentElement('beforeend',input)
                    containerDiv.insertAdjacentElement('beforeend',inputContainer)
                    settingsContainer.insertAdjacentElement('beforeend', containerDiv)
                }
            })
    }


    toggleDisplay(){
        if (this.element){
            if (this.element.node.style.opacity == 0){
                this.element.node.style.opacity = 1
                this.element.node.style.pointerEvents = 'auto'
                this.shown = true
            } else {
                this.element.node.style.opacity = 0
                this.element.node.style.pointerEvents = 'none'
                this.shown = false
            }
        }
    }

    removeEdge(e, ignoreManager=false){
        this.graph.removeEdge(e)
        if (!ignoreManager) this.manager.removeEdge(this.app.props.id, e.structure)
    }


    animate(source,target){
        if (this.shown){
            this.animateNode(source,'source')
            this.animateNode(target,'target')
            this.animateEdge(source,target)
        }
    }

    animateNode(node,type){
        let instance = this.graph.nodes[node.label]
        if (instance){
            let portEl = instance.element.querySelector(`.${type}-ports`).querySelector(`.port-${node.port}`)
            if (portEl) {
                portEl.classList.add('updated')
                portEl.setAttribute('data-update', Date.now())
                setTimeout(()=>{
                    if (portEl.getAttribute('data-update') < Date.now() - 450){
                        portEl.classList.remove('updated')
                    }
                }, 500)
            }
        }
    }

    animateEdge(source,target){
        let instance = this.graph.nodes[source.label]
        instance.edges.forEach(e=>{
            let splitSource = e.structure.source.split(':')
            if (splitSource.length < 2 ) splitSource.push('default')
            if(splitSource[1] === source.port){
                let splitTarget = e.structure.target.split(':')
                if (splitTarget.length < 2 ) splitTarget.push('default')
                if (splitTarget[0] === target.label && splitTarget[1] == target.port){
                    e.node.curve.classList.add('updated')
                    e.node.curve.setAttribute('data-update', Date.now())
                    setTimeout(()=>{
                        if (e.node.curve.getAttribute('data-update') < Date.now() - 450){
                            e.node.curve.classList.remove('updated')
                        }
                    }, 500)
                }
            }
        })
    }


    drawEdge = (p1,p2) => {
        let dict = {}
        let type = Array.from(p1.parentNode.classList).find((str) => {
            if (str.includes('-ports')) return true
        })
        type = type.replace('-ports','')

        dict[type] = `${p1.getAttribute('data-node')}:${p1.getAttribute('data-port')}`
        
        if (p2 && p2.classList.contains('node-port')){
            let otherType = (type === 'source') ? 'target' : 'source'
            dict[otherType] = `${p2.getAttribute('data-node')}:${p2.getAttribute('data-port')}`
            this.addEdge(dict)
        } else {
            this.addEdge(dict)
        }
    }

    addEdge = async (e) => {
        let edge = await this.graph.addEdge(e)
        this.addEdgeReactivity(edge) 
        this.app.info.graph.edges.push(edge.structure) // Change actual settings file
        this.manager.addEdge(this.app.props.id,edge.structure)   
    }

    addNode(cls){
        let nodeInfo = {id: cls.name, class: cls, params: {}}
        nodeInfo = this.manager.addNode(this.app.props.id, nodeInfo)
        this.app.insertInterface(nodeInfo)
        this.graph.addNode(nodeInfo)
        this.app.info.graph.nodes.push(nodeInfo) // Change actual settings file
        this.addNodeEvents(this.graph.nodes[nodeInfo.id])
        this.addPortEvents(this.graph.nodes[nodeInfo.id])
    }

    addNodeEvents(node){
        let nodeElement = node.element.querySelector('.brainsatplay-display-node')

        nodeElement.onclick = () => {
            let clickedNode = this.graph.parentNode.querySelector('.clicked')
            if (clickedNode) clickedNode.classList.remove('clicked')
            nodeElement.classList.add('clicked')

            // Plugin GUI
            let selectedParams = document.getElementById(`${this.props.id}params`)
            selectedParams.innerHTML = ''
            let plugin = node.nodeInfo.instance
            for (let key in plugin.paramOptions){

                // Properly Nest Divs
                let containerDiv = document.createElement('div')
                containerDiv.insertAdjacentHTML('beforeend',`<div><p>${key}</p></div>`)
                let inputContainer = document.createElement('div')
                inputContainer.style.position = 'relative'

                // Sort through Params
                if (plugin.paramOptions[key].show != false){
                let defaultType = typeof plugin.paramOptions[key].default
                let specifiedOptions = plugin.paramOptions[key].options
                let optionsType = typeof specifiedOptions
                let input;

                if (optionsType == 'object' && specifiedOptions != null){
                    let options = ``
                    plugin.paramOptions[key].options.forEach(option => {
                        let attr = ''
                        if (option === plugin.params[key]) attr = 'selected'
                        options += `<option value="${option}" ${attr}>${option}</option>`
                    })
                    input = document.createElement('select')
                    input.innerHTML = options
                } else if (defaultType === 'boolean'){
                    input = document.createElement('input')
                    input.type = 'checkbox'
                    input.value = plugin.params[key]
                } else if (defaultType === 'number'){
                    if ('min' in plugin.paramOptions[key] && 'max' in plugin.paramOptions[key]){
                        input = document.createElement('input')
                        input.type = 'range'
                        input.min = plugin.paramOptions[key].min
                        input.max = plugin.paramOptions[key].max
                        input.value = plugin.params[key]
                        if (plugin.paramOptions[key].step) input.step = plugin.paramOptions[key].step
                        let output = document.createElement('output')
                        inputContainer.insertAdjacentElement('afterbegin',output)
                        output.innerHTML = input.value
                        input.addEventListener('input', (e) => {output.innerHTML = input.value}, false)
                    } else {
                        input = document.createElement('input')
                        input.type = 'number'
                        input.value = plugin.params[key]
                    }
                } else {
                    input = document.createElement('input')
                    input.type = 'text'
                    input.value = plugin.params[key]
                }

                // Add to Document
                inputContainer.insertAdjacentElement('beforeend',input)
                containerDiv.insertAdjacentElement('beforeend',inputContainer)
                selectedParams.insertAdjacentElement('beforeend', containerDiv)

                // Change Live Params with Input Changes
                input.oninput = (e) => {
                    plugin.params[key] = input.value
                }
            }
            }


            // Edit and Delete Buttons
            document.getElementById(`${this.props.id}edit`).style.display = ''
            document.getElementById(`${this.props.id}delete`).style.display = ''
            document.getElementById(`${this.props.id}delete`).onclick = () => {
                this.removeNode(node.nodeInfo)
            }

            document.getElementById(`${this.props.id}edit`).onclick = (e) => {
                this.createFile(node.nodeInfo.class)
            }
        }
    }

    createFile(target, name){
        if (name == null || name === '') name = `My${target.name}`
        let settings = {}
        let container = this.createView(undefined, 'brainsatplay-node-code', '')
        settings.language = 'javascript'
        settings.onOpen = (res) => {
            container.style.pointerEvents = 'all'
            container.style.opacity = '1'
        }

        settings.onSave = (cls) => {
            this.addNodeOption(cls.id, 'custom', cls.name, () => {
                this.addNode(cls)
            })

            for (let node in this.plugins.nodes){
                if (node.instance instanceof target){
                    let properties = Object.getOwnPropertyNames( node.instance )
                    properties.forEach(k => {
                        node.instance[k] = cls.prototype[k]
                    })
                }
            }
            target = cls
            this.addNode(cls)
        }
        settings.onClose = (res) => {
            container.style.pointerEvents = 'none'
            container.style.opacity = '0'
        }
        settings.target = target
        settings.className = name
        let editor = new LiveEditor(settings,container)
        this.addTab(`${name}.js`, container.id, settings.onOpen)
    }

    createView(id=String(Math.floor(Math.random()*1000000)), className, content){
        let view = document.createElement('div')
        view.id = id
        view.className = className
        view.innerHTML = content
        this.mainPage.insertAdjacentElement('beforeend',view)
        return view
    }

    addPortEvents(node){
        let portElements = node.element.querySelectorAll('.node-port')

        for (let portElement of portElements){
            // Listen for clicks to draw SVG edge
            portElement.onpointerdown = (e) => {
                this.drawEdge(portElement)
            }
        }
    }

    removeNode = (nodeInfo) => {
        this.manager.remove(this.app.props.id, nodeInfo.class.id, nodeInfo.instance.label)
        this.graph.removeNode(nodeInfo)
    }
 

    createPluginSearch = (container) => {
        let selector = document.createElement('div')
        selector.id = `${this.props.id}nodeSelector`
        selector.classList.add(`brainsatplay-node-selector`)

        let addButton = document.getElementById(`${this.props.id}add`)
        addButton.addEventListener('click', () => {
            if (selector.style.opacity == '1'){
                selector.style.opacity='0'
                selector.style.pointerEvents='none'
                search.value = ''
            } else {
                selector.style.opacity='1'
                selector.style.pointerEvents='all'
            }
        })
        let selectorMenu = document.createElement('div')
        selectorMenu.classList.add(`brainsatplay-node-selector-menu`)
        selectorMenu.insertAdjacentHTML('beforeend',`<input type="text" placeholder="Select a node"></input><div class="node-options"></div>`)
        selector.insertAdjacentElement('beforeend',selectorMenu)
        container.insertAdjacentElement('afterbegin',selector)

        // Populate Available Nodes
        let nodeDiv = document.createElement('div')
        let search = selectorMenu.getElementsByTagName(`input`)[0]


        // Allow Search of Plugins
        search.oninput = (e) => {
            let regexp = new RegExp(e.target.value, 'i')
            this.searchOptions.forEach(o => {
                let test = regexp.test(o.label)
                if (test || o.label == 'Add New Plugin') {
                    o.element.style.display = ''
                } else {
                    o.element.style.display = 'none'
                }
            })
        }

        this.classRegistry = Object.assign({}, plugins)
        this.classRegistry['custom'] = {}
        let usedClasses = []

        this.addNodeOption('newplugin', 'custom', 'Add New Plugin', () => {
            this.createFile(Plugin, search.value)
        })


        for (let type in this.classRegistry){
            let nodeType = this.classRegistry[type]

            for (let key in nodeType){
                let cls = this.classRegistry[type][key]
                if (!usedClasses.includes(cls.id)){
                    let label = (type === 'custom') ? cls.name : `${type}.${cls.name}`
                    this.addNodeOption(cls.id, type,label, () => {
                        this.addNode(cls)
                    })
                    usedClasses.push(cls)
                }
            }
        }

        for (let key in this.plugins.nodes){
            let cls = this.plugins.nodes[key].class
            if (!usedClasses.includes(cls)){
                this.classRegistry['custom'][key] = cls
                this.addNodeOption(cls.id, 'custom', cls.name, () => {
                    this.addNode(cls)
                })
            }
        }

        selectorMenu.insertAdjacentElement('beforeend',nodeDiv)
        selector.style.opacity = '0'
        selector.style.pointerEvents = 'none'
        this.responsive()
    }

    addNodeOption(id, type, label, onClick){

        let options = document.querySelector('.brainsatplay-node-selector-menu').querySelector(`.node-options`)
        let selectedType = options.querySelector(`.nodetype-${type}`)
        if (selectedType == null) {
            selectedType = document.createElement('div')
            selectedType.classList.add(`nodetype-${type}`)
            options.insertAdjacentElement('beforeend',selectedType)
        }

        let element = selectedType.querySelector(`.${label}`)
        if (element == null){
            element = document.createElement('div')
            element.classList.add("brainsatplay-option-node")
            element.classList.add(`${id}`)

            // element.insertAdjacentElement('beforeend',labelDiv)
            selectedType.insertAdjacentElement('beforeend',element)

            this.searchOptions.push({label, element})
        }

        element.innerHTML = `<p>${label}</p>`

        element.onclick = () => {
            onClick()
            document.getElementById(`${this.props.id}add`).click() // Close menu
        }
    }



    responsive = () => {
        let selector = document.getElementById(`${this.props.id}nodeSelector`)

        if (selector){
            selector.style.height = `${selector.parentNode.offsetHeight}px`
            selector.style.width = `${selector.parentNode.offsetWidth}px`
        }

        let tabContainer = document.getElementById(`${this.props.id}ViewTabs`)
        if (tabContainer){
            let mainWidth =  this.container.offsetWidth - this.sidebar.offsetWidth
            this.mainPage.style.width = `${mainWidth}px`
        }

        if(this.graph){
            for (let key in this.graph.nodes){
                this.graph.nodes[key].updateAllEdges()
            }
        }
    }

    deinit(){
        if (this.element){
            this.element.node.style.opacity = '0'
            setTimeout(() => {this.element.node.remove()}, 500)
        }
    }
}