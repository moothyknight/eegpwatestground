import {brainsatplay} from '../../brainsatplay'
import {DOMFragment} from '../../frontend/utils/DOMFragment'

//Example Applet for integrating with the UI Manager
export class AppletBrowser {

    static devices = []; //{devices:['eeg'], eegChannelTags:['FP1','FP2']  }

    constructor(
        parent=document.body,
        bci=null,
        settings=[]
    ) {
    
        //-------Keep these------- 
        this.bci = bci; //Reference to the brainsatplay session to access data and subscribe
        this.parentNode = parent;
        this.settings = settings;
        this.AppletHTML = null;
        //------------------------

        this.props = { //Changes to this can be used to auto-update the HTML and track important UI values 
            id: String(Math.floor(Math.random()*1000000)), //Keep random ID
            buttonOutput: 0 //Add whatever else
        };
    }

    //---------------------------------
    //---Required template functions---
    //---------------------------------

     //Initalize the app with the DOMFragment component for HTML rendering/logic to be used by the UI manager. Customize the app however otherwise.
    init() {

        //HTML render function, can also just be a plain template string, add the random ID to named divs so they don't cause conflicts with other UI elements
        let HTMLtemplate = (props=this.props) => { 
            let appletStyle = `
            width: 200px; 
            height: 200px; 
            padding: 25px;
            cursor: pointer;
            transition: 0.5s;
            border: 1px solid rgb(200, 200, 200);
            border-radius: 5px;
            margin: 25px;
            position: relative;     
            font-size: 80%;
            `
            return `
            <div id='${props.id}' style='
            height:${props.height}; 
            width:${props.width}; 
            display: flex;
            flex-wrap: wrap; 
            align-items: center; 
            justify-content: center;
            overflow: scroll;' 
            >
                <div id="${props.id}-eeg" style="${appletStyle}">
                <h3>EEG Neurofeedback</h3>
                <p>Train your brain.</p>
                </div>
                <div id="${props.id}-heg" style="${appletStyle}">
                <h3>HEG Neurofeedback</h3>
                <p>Train your brain.</p>
                </div>
                <div id="${props.id}-blob" style="${appletStyle}; opacity: 0.5;">
                <h3>Blob</h3>
                <p>Train your brain.</p>
                </div>
                <div id="${props.id}-enso" style="${appletStyle}; opacity: 0.5;">
                <h3>Enso</h3>
                <p>Train your brain.</p>
                </div>
                <div id="${props.id}-cosmos" style="${appletStyle}; opacity: 0.5;">
                <h3>Cosmos</h3>
                <p>Train your brain.</p>
                </div>
                <div id="${props.id}-nexus" style="${appletStyle}; opacity: 0.5;">
                <h3>Nexus</h3>
                <p>Train your brain.</p>
                </div>
                <div id="${props.id}-uplot" style="${appletStyle}; opacity: 0.5;">
                <h3>uPlot</h3>
                <p>See your brain.</p>
                </div>
                <div id="${props.id}-spectrogram" style="${appletStyle}; opacity: 0.5;">
                <h3>Spectrogram</h3>
                <p>See your brain.</p>
                </div>
                <div id="${props.id}-smooth" style="${appletStyle}; opacity: 0.5;">
                <h3>Smooth</h3>
                <p>See your brain.</p>
                </div>
            </div>
            `;
        }

        //HTML UI logic setup. e.g. buttons, animations, xhr, etc.
        let setupHTML = (props=this.props) => {
            document.getElementById(props.id);   
        }

        this.AppletHTML = new DOMFragment( // Fast HTML rendering container object
            HTMLtemplate,       //Define the html template string or function with properties
            this.parentNode,    //Define where to append to (use the parentNode)
            this.props,         //Reference to the HTML render properties (optional)
            setupHTML,          //The setup functions for buttons and other onclick/onchange/etc functions which won't work inline in the template string
            undefined,          //Can have an onchange function fire when properties change
            "NEVER"             //Changes to props or the template string will automatically rerender the html template if "NEVER" is changed to "FRAMERATE" or another value, otherwise the UI manager handles resizing and reinits when new apps are added/destroyed
        );  

        if(this.settings.length > 0) { this.configure(this.settings); } //you can give the app initialization settings if you want via an array.


        // Applet Browser
        const container = document.getElementById(this.props.id)
        const appletDivs = container.getElementsByTagName('div')
        for (let div of appletDivs){
            div.onclick = (e) => {
                window.location.href += `#${e.target.id.split(this.props.id + '-')[1]}`;
                location.reload();
            }
        }
        // //joining path of directory 
        // console.log(__dirname)
        // const directoryPath = path.join(__dirname, 'Documents');
        // //passsing directoryPath and callback function
        // fs.readdir(directoryPath, function (err, files) {
        //     //handling error
        //     if (err) {
        //         return console.log('Unable to scan directory: ' + err);
        //     } 
        //     //listing all files using forEach
        //     files.forEach(function (file) {
        //         // Do whatever you want to do with the file
        //         console.log(file); 
        //     });
        // })

        //Add whatever else you need to initialize
        this.responsive()
    }

    //Delete all event listeners and loops here and delete the HTML block
    deinit() {
        this.AppletHTML.deleteNode();
        //Be sure to unsubscribe from state if using it and remove any extra event listeners
    }

    //Responsive UI update, for resizing and responding to new connections detected by the UI manager
    responsive() {
        let container = document.getElementById(this.props.id)
        //let canvas = document.getElementById(this.props.id+"canvas");
        //canvas.width = this.AppletHTML.node.clientWidth;
        //canvas.height = this.AppletHTML.node.clientHeight;
    }

    configure(settings=[]) { //For configuring from the address bar or saved settings. Expects an array of arguments [a,b,c] to do whatever with
        settings.forEach((cmd,i) => {
            //if(cmd === 'x'){//doSomething;}
        });
    }

    //--------------------------------------------
    //--Add anything else for internal use below--
    //--------------------------------------------

    //doSomething(){}

   
} 