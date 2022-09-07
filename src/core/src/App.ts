// An integrated freerange + brainsatplay App class

// import WASL from 'wasl/dist/index.esm'
import WASL from '../external/wasl/index.esm'
import * as freerange from '../external/freerange/index.esm'
// import * as freerange from 'freerange/dist/index.esm'
import { AppOptions } from './types';
import Plugins from "./Plugins";
import * as utils from './utils'

let defaultOptions = {
    ignore: ['.DS_Store', '.git'],
    debug: false,
    autosync: [
        '*.wasl.json'
    ],
}

export default class App {

    #input: any;

    wasl: WASL; // active wasl instance
    plugins: Plugins
    filesystem?: string | freerange.System;
    onstart: any
    onstop: any
    ignore: string[] = ['.DS_Store', '.git']
    debug: boolean = false
    options: AppOptions = defaultOptions
    editable: boolean = null
    #sameRoot = 4

    constructor(input, options = {}) {
        this.#input = input
        this.setOptions(options)
    }

    setOptions = (options) => {
        this.options = Object.assign(this.options, options)
        if (this.options.sameRoot) this.#sameRoot = this.options.sameRoot
        return this.options
    }

    compile = async () => {
        const packageContents = await (await this.filesystem.open('package.json')).body
        let mainPath = packageContents?.main ?? 'index.wasl.json'

            // Get main file
            const file = await this.filesystem.open(mainPath)

            // Get WASL files in reference mode
            let filesystem = {}


            // Get attached plugins
            // this.plugins = new Plugins(this.filesystem)
            // await this.plugins.init()

            if (file) {
                const body = await file.body
                const toFilterOut = file.path.split('/')

                await Promise.all(Array.from(this.filesystem.files.list.entries()).map(async (arr) => {
                    let path = arr[0]
                    const file = arr[1]

                    // Remove Common Paths
                    const splitPath = path.split('/')
                    let i = 0
                    let ogLength = splitPath.length
                    let keepGoing = true
                    do {
                        keepGoing = splitPath[0] === toFilterOut[i]
                        if (keepGoing) splitPath.shift() // remove first element
                        if (i === ogLength - 2) keepGoing = false // stop before removing file name
                        i++
                    } while (keepGoing)
                    if (i > this.#sameRoot) path = splitPath.join('/') // arbitrary cutoff for what counts as the same reference
                    filesystem[path] = await file.body // loading in
                }))
                
                this.wasl = await this.create(body, Object.assign(this.options, {filesystem, _modeOverride: 'reference', _overrideRemote: true}))
                return this.wasl
            } else if (packageContents?.main) console.error('The "main" field in the supplied package.json is not pointing to an appropriate entrypoint.')
            else console.error('No index.wasl.json file found at the expected root location.')
    }

    join = utils.join

    createFilesystem = async (input?, options=this.options) => {

        // Create a new filesystem
        let clonedOptions = Object.assign({}, options)
        let system = new freerange.System(input, clonedOptions)

        const done = await system.init().then(() => system).catch((e) => {
            console.warn('system init failed', e)
            return undefined
        })

        // Load WASL Files Locally
        if (this.wasl){

            // create actual files
            let createPkg = true
            for (let path in this.wasl.files)  {
                await system.addExternal(path, this.wasl.files[path].text) // note: does not recognize xxx:// formats when loading into a native filesystem
                if (path === 'package.json') createPkg = false
            }

            // place reference file at the root (for later loading)
            if (createPkg) {
                console.warn('Creating package.json file at the root to reference later!')
                await system.addExternal('package.json', `{"main": "${this.#input}"}`)
            }
        }

        return done
    }

    create = async (input, options) => {
        let wasl = new WASL(input, options)
        await wasl.init()
        await wasl.start()
        return wasl
    }

    start = async (input=this.#input, options=this.options, save=true) => {
        options = this.setOptions(options) // update options
        if (save && this.filesystem instanceof freerange.System) this.save(false) // make sure to save old version
        await this.stop() 

        // Correct input (if remote)
        let isUrl = false
        try {
            new URL(input ?? '').href
            input = this.join(input)
            isUrl = true
        } catch {
            
        }

        const isObject = typeof input === 'object'

        console.log('Object', isObject)
        console.log('URL', isUrl)


        let system;
        // Base WASL Application
        if (isObject || isUrl) this.wasl = await this.create(input, options)
        
        // Choose a Directory
        else system = await this.createFilesystem(input)
        

        // Notify if Editable
        if (system){ // compile From filesystem
            this.filesystem = system
            this.editable = true
            await this.compile()
        } else if (this.wasl && Object.keys(this.wasl.files).length === 0) {
            console.warn('No files have been loaded. Cannot edit files loaded in Reference Mode.')
            this.editable = false
        } else this.editable = true

        return this.wasl
    }   

    stop = async () => {
        if (this.wasl) await this.wasl.stop()
    }
    
    
    save = async (restart=true) => {
        await this.stop()

        if (this.editable) {
            if (!this.filesystem) this.filesystem = await this.createFilesystem() // allow the user to specify
            if (this.filesystem) await this.filesystem.save()
        }

        if (restart && this.wasl) await this.wasl.start()
    }
}