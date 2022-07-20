// An integrated freerange + brainsatplay App class

import * as freerange from 'freerange/dist/index.esm'
import App from "../App";
import { EditableAppOptions } from '../types';
import Plugins from "./Plugins";
import * as utils from '../utils'

export default class EditableApp {


    active: App;
    plugins: Plugins
    filesystem?: string | freerange.System;
    onstart: any
    onstop: any
    ignore: string[] = ['.DS_Store', '.git']
    debug: boolean = false
    options: EditableAppOptions = {
        ignore: ['.DS_Store', '.git'],
        debug: false
    }

    packagePath = '/package.json'

    // TODO: Actually inherit from the main App class...
    parentNode?: HTMLElement = document.body


    constructor(input, options = {}) {
        this.filesystem = input
        this.options = Object.assign(this.options, options)
    }

    compile = async () => {
        const packageContents = await (await this.filesystem.open('package.json')).body
        if (packageContents){

            // Get main file
            const file = await this.filesystem.open(packageContents.main)

            // Get attached plugins
            this.plugins = new Plugins(this.filesystem)
            await this.plugins.init()

            if (file) {
                const main = await this.plugins.get(packageContents.main, 'module')
                const mainGraph = await this.plugins.get(packageContents.main, 'graph')
                this.active.setPackage(packageContents)
                await this.active.setInfo(main)
                await this.active.setTree(mainGraph)
            } else console.error('The "main" field in the supplied package.json is not pointing to an appropriate entrypoint.')
        }
    }

    join = utils.join

    createFilesystem = async (input, options=this.options) => {

        // Derive the input to freerange.System
        if (!input && !(this.filesystem instanceof freerange.System)) input = this.filesystem
        else this.filesystem = input

        // Correct input (if remote)

        try {
            new URL(input ?? '').href
            input = this.join(input, this.packagePath)
        } catch {
            
        }

        // Create a new filesystem
        let clonedOptions = Object.assign({}, options)
        let system = new freerange.System(input, clonedOptions)

        return await system.init().then(() => system).catch(() => undefined)
    }

    setParent = (parentNode) => {
        if (parentNode instanceof HTMLElement) {
            this.parentNode = parentNode
        } else console.warn('Input is not a valid HTML element', parentNode)
    }

    start = async (input?) => {
        await this.stop() 
        const system = await this.createFilesystem(input)
        this.active = new App(undefined, this.options)
        if (system){
            this.filesystem = system
            this.active.compile = this.compile
        } else {
            delete this.filesystem
            delete this.compile
        }

        this.active.setParent(this.parentNode)
        this.active.onstart = this.onstart
        this.active.onstop = this.onstop
        return await this.active.start()
    }   

    stop = async () => {
        if (this.active) await this.active.stop()
    }
    
    
    save = async () => {
        await this.stop()
        await this.filesystem.save()
        await this.active.start()
    }
}