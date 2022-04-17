import { randomId } from "../../common/id.utils";
import { getParams } from '../../common/parse.utils';


type ExportedProcess = {
    id: string;
    processes: {[x: string]: ExportedProcess},
    targets: string[], // Could also be called "children"
    operator: Function
}


export default class Process {

    static _id = randomId()
    id: string = randomId()
    processes: Map<string, Process> = new Map(); // Internal processs
    targets: {[x:string]:Process} = {}; // External processs
    parent: Process | null;
    debug: boolean;

    // Latest Process Output
    private _value: any; 
    set value(input) {
        this._notify(input)
    }
    get value() {
        return this._value
    }

    // Process Operator
    private _operator: Function;
    set operator(input) {
        // Create Static Processes for Function Arguments (skipping (1) self and (2) input)
        
        this.processes = new Map()
        const args = getParams(input) // Get Parameters

        args.map(o => {
            o.name = o.name.replace(/\d+$/, "") // Remove trailing numbers to support transformed code...
            return o
        }).slice(2).forEach(o => {
            this.set(o.name, args[o.default]) // Set to default value
        })

        this._operator = input
        if (!(this._operator instanceof Function)) this.value = this._operator
    }
    get operator () {
        return this._operator
    }

    constructor(operator?: Function | any, parent: Process = null, debug: boolean = false){
        
        this.operator = operator
        if (parent) parent.add(this)

        this.debug = debug
    }

    // --------------------- METHODS ---------------------
    // init = () => { 
    //     window.addEventListener('resize', this.resize)
    //     this.oninit() // specified by user
    // }

    // deinit = () => { 
    //     window.removeEventListener('resize', this.resize)
    //     this.ondeinit() // specified by user
    // }
    
    // resize = ()  => { this.onresize() }
    
    // Basic Map Functions
    get = (id:string) => this.processes.get(id)
    set = ( id?: string | number, input?: any ) => {
        
        if (typeof id === 'number') id = this.processes.keys[id]
        let process = this.processes.get(id as string)

        // Update Operator 
        if (process && !(input instanceof Process)) {
           process.operator = input
        }
        // Create Process
        else {

            if (input instanceof Process ){
                if (process) input.value = process.value // Transfer value
                process = input
            } else {
                process = new Process(input, this, this.debug)
            }

            this.processes.set(id as string, process)
            process.parent = this // setting parent
        }
        return process
    }

    delete = (id:string) => this.processes.delete(id)

    // Subscribe to Another Process's Output
    subscribe = (
        target?: Process | Function, // External or Exposed Process
    ) => {

        let process;
        if (target instanceof Process ) process = target
        else if (target instanceof Function) process = new Process(target, this.parent, this.debug) // set parent
        else return null

        // Step #2: Register Edge
        if (!(process.id in this.targets)) this.targets[process.id] = process

        return process.id
    }

    unsubscribe = (id:string) => {
        delete this.targets[id] // Remove edge with target process
    }


    // Internal Process Management
    // TODO: When is this actually useful?
    add = (process: Process) => {

        // Initialize Parent
        if (!process.parent) {
            process.parent = this
            // this.targets[process.id] = process
        } 
        
        // Catch Existing Parent
        else {
            if (process.parent === this) console.error('Process is already within this parent...')
            else console.error('Process already has another parent...')
        }
    }

    remove = (id:string) => {
        delete this.targets[id] // Remove edge with target process
    }


    // --------------------- CALLBACKS ---------------------
    // oninit: (self?:Process) => void = () => {};
    // ondeinit: (self?:Process) => void = () => {};
    // onconnect: (self?:Process) => void = () => {};
    // ondisconnect: (self?:Process) => void = () => {};
    // onresize: (self?:Process) => void = () => {};


    // --------------------- Push Data In ---------------------
    run = async (...args) => {
        return await this._onrun(...args)
    }

    private _onrun: (...arr:any[]) => void = async (...arr:any[]) => {

        // Step #1: Transform Inputs into Single Output
        if (this.debug) console.log(`Input (${this.id}) : ${arr[0]}`)
        let output;

        // Use manual inputs as base (to account for spread operator)
        const input = arr[0] // Grab base input
        const inputArr = arr.slice(1)
        const processArr = Array.from(this.processes.values())
        const baseArr = (inputArr.length > processArr.length) ? inputArr : processArr
        const args = baseArr.map((v, i) => {
            // Manual input override
            if (processArr?.[i] === undefined || inputArr[i] !== undefined) return inputArr[i]
            else return processArr[i].value
        })

        output = (this.operator instanceof Function) ? await this.operator(this.parent ?? this, input, ...args) : input
        if (this.debug) console.log(`Output (${this.id}) : ${output}`)

        // Step #2: Try to Send Output to Connected Processsall(promises)
        return await this._notify(output)
    };

    // DEPRECATED: Only Send if Different
    private _send = async (output:any) => {
        if (this._value !== output) return await this._notify(output)
        else return output
    }

    // Notify Target Processes (if not a NaN)
    private _notify = async (output:any) => {
        if (!isNaN(output)) this._value = output // Set value to output
        const keys = Object.keys(this.targets)
        if (keys.length > 0) return await Promise.all(keys.map(id => {
            return this.targets[id].run(output)
        }))
        else return output
    }


    // ------------- Helper Functions -------------

    // List the structure of the processes
    list = (el: HTMLElement) => {

        const list = document.createElement('ul')
        this.processes.forEach((process,k) => {
            const li = document.createElement('li')
            li.innerHTML = `${k} (${process.id}) - ${process.value}`
            process.list(li)
            list.insertAdjacentElement('beforeend', li)
        })

        el.insertAdjacentElement('beforeend', list)

    }

    // Export to a JSONifiable object
    export = () => {
        const o: ExportedProcess = {
            id: this.id, 
            targets: [], 
            processes: {}, 
            operator: this.operator
        }

        this.processes.forEach((process,k) => o.processes[k] = process.export())
        for (let k in this.targets) o.targets.push(k)

        return o
    }

    // Import a parsed JSON Process
    import = (
        o:ExportedProcess, 
        registry =  {
            processes: {},
            targets: {}
        }
    ) => {
        
        if (o){
            registry.processes[o.id] = this
            registry.targets[o.id] = []

            // Derive Processes from Operator
            this.operator = o.operator

            // Instantiate Internal Processes
            if (o?.processes){
                for (let k in o.processes) {
                    const p = new Process(o.processes[k]?.operator, this, this.debug)
                    p.import(o.processes[k], registry)
                    this.set(k, p)
                }
            }

            // Link to External Targets
            registry.targets[o.id] = o.targets

            // Instantiate Links (if top)
            if (!this.parent) for (let id in registry.targets) {
                registry.targets[id].forEach(targetId => {
                    registry.processes[id].subscribe(registry.processes[targetId])
                })
            }
        }
    }

        // Load module as Processes
        load = (o: Object | string) => {

            // Get URLs
            if (typeof o === 'string') o = fetch(o)
    
    
            if (typeof o === 'object'){
    
                let drill = (o:Object) => {
                    for (let k in o) {
                        const isClass = (v) => typeof v === 'function' && /^\s*class\s+/.test(v.toString());
    
                        // Load Class
                        if (o[k] instanceof Function && isClass(o[k])){
    
                                try {
                                    const inst = new o[k]()
                                    console.warn('Loaded', inst)
                                    const p = new Process(null, this, this.debug)
                                    p.load(inst)
                                    this.set(k, p)
                                    // drill(inst)
                                } catch (e) {
                                    console.error( 'Cannot instantiate class ' + o[k].name , e)
                                }
    
                                console.error( 'TODO: Get constructor arguments' )
    
                        } 
                        
                        // Load Standard Function
                        else {
                            const p = new Process(o[k], this, this.debug)
                            this.set(k, p)
                        }
                    }
                }
    
                drill(o)
            }
        }
}