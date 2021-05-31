// Available Uniforms for shader effects:
// iResolution: {value: new THREE.Vector2(400,400)}, // Resolution of the renderer 
// iTime: {value: 0},                      // Time (in seconds)


import {Session} from '../../../libraries/js/src/Session'
import {DOMFragment} from '../../../libraries/js/src/ui/DOMFragment'
import { SoundJS } from '../../../platform/js/frontend/UX/Sound';
import Prism from 'prismjs';
import 'prismjs/components/prism-c'; // need this
import 'prismjs/components/prism-glsl'; // need this
// import "prismjs/plugins/line-numbers/prism-line-numbers";
import "prism-themes/themes/prism-vsc-dark-plus.css"
// import '../../../libraries/js/src/ui/styles/defaults.css'

import * as settingsFile from './settings'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GUI } from 'three/examples/jsm/libs/dat.gui.module'

import {addChannelOptions, addCoherenceOptions } from '../../../platform/js/frontend/menus/selectTemplates'


//Import shader urls
import vertexShader from './shaders/vertex.glsl'
import galaxyFragmentShader from "./shaders/fractalGalaxy/fragment.glsl"
import negaGalaxyFragmentShader from "./shaders/nega_fractalGalaxy/fragment.glsl"
import wavesFragmentShader from './shaders/waves/fragment.glsl'
import noiseCircleFragmentShader from './shaders/noiseCircle/fragment.glsl'
import creationFragmentShader from './shaders/creation/fragment.glsl'
import blobFragmentShader from './shaders/voronoiblobs/fragment.glsl'
import fractalpyramidFragmentShader from './shaders/fractalpyramid/fragment.glsl'
import cineshaderlavaFragmentShader from './shaders/cineshaderlava/fragment.glsl'
import octagramsFragmentShader from './shaders/octagrams/fragment.glsl'

//Import sound files
import bloops from './sounds/wav/guitarbloops.wav'
import acousticloop3 from './sounds/wav/acousticloop3.wav'
import washhigh from './sounds/wav/wash_high.wav'
import washlow from './sounds/wav/wash_low.wav'
import oceanwaves from './sounds/mp3/oceanwaves.mp3'
import fluteloop1 from './sounds/wav/fluteloops1.wav'
import fluteloop2 from './sounds/wav/fluteloops2.wav'
import fluteloop3 from './sounds/wav/fluteloops3.wav'
import fluteshot1 from './sounds/wav/fluteshot1.wav'
import fluteshot2 from './sounds/wav/fluteshot2.wav'
import drumhit1 from './sounds/wav/drum_hit_1.wav'
import drumkick1 from './sounds/wav/drum_kick_1.wav'
import { select } from 'd3-selection';
import { TutorialManager } from '../../../libraries/js/src/ui/TutorialManager';

//Example Applet for integrating with the UI Manager
export class SensoriumApplet {

    constructor(
        parent=document.body,
        session=new Session(),
        settings=[]
    ) {
    
        //-------Keep these------- 
        this.session = session; //Reference to the Session to access data and subscribe
        this.parentNode = parent;
        this.info = settingsFile.settings;
        this.settings = settings;
        this.AppletHTML = null;
        //------------------------

        //-------Required Multiplayer Properties------- 
        this.subtitle = `Dynamic audiovisual feedback. Let's get weird!` // Specify a subtitle for the title screen
        this.streams = ['modifiers'] // Register your app data streams
        //----------------------------------------------

        //-------Other Multiplayer Properties------- 
        this.stateIds = []
        //----------------------------------------------

        this.props = { //Changes to this can be used to auto-update the HTML and track important UI values 
            id: String(Math.floor(Math.random()*1000000)), //Keep random ID
            //Add whatever else
        };

        this.tutorialManager = this.createTutorial()


        // Audio
        this.effectStruct = { source:undefined, input:undefined, controls:undefined, feedback:undefined, feedbackOption:undefined, muted:false, lastGain:1, uiIdx:false, sourceIdx:false, playing:false, id:undefined, paused:false, playbackRate:1 };
        this.visuals = [];
        this.effects = [];//array of effectStructs
        this.soundUrls = [
            {url:oceanwaves, name:"Ocean Waves"},
            {url:bloops, name:"Guitar Bloops"},
            {url:washhigh, name:"Guitar Wash (High)"},
            {url:washlow, name:"Guitar Wash (Low)"},
            {url:acousticloop3, name:"Acoustic Loop"},
            {url:drumhit1, name:"Drum Sound 1"},
            {url:drumkick1, name:"Drum Kick 1"},
            {url:fluteshot2, name:"Flute Shot 2"},
            {url:fluteloop1, name:"Flute Loop 1"},
            {url:fluteloop2, name:"Flute Loop 2"},
            {url:fluteloop3, name:"Flute Loop 3"},
            {url:fluteshot1, name:"Flute Shot 1"},
            {url:fluteshot2, name:"Flute Shot 2"},
        ];

        this.looping = false;
        this.hidden = false;
        this.editorhidden = true;
        this.quickrefhidden = true;

        // UI
        this.three = {}
        this.currentShader = null;

        this.three.planes = [];
        this.guiControllers = []

        //Available uniforms for shaders. See comments for usage
        this.modifiers = {
            iAudio:           new Array(256).fill(0),     //Audio analyser FFT, array of 256, values max at 255
            iHRV:             1,                          //Heart Rate Variability (values typically 5-30)
            iHEG:             0,                          //HEG change from baseline, starts at zero and can go positive or negative
            iHR:              1,                          //Heart Rate in BPM
            iHB:              0,                          //Is 1 when a heart beat occurs, falls off toward zero on a 1/t curve (s)
            iBRV:             0,                          //Breathing rate variability, usually low, ideal is 0.
            iFFT:             new Array(256).fill(0),     //Raw EEG FFT, array of 256. Values *should* typically be between 0 and 100 (for microvolts) but this can vary a lot so normalize or clamp values as you use them
            iDelta:           1,                          //Delta bandpower average. The following bandpowers have generally decreasing amplitudes with frequency.
            iTheta:           1,                          //Theta bandpower average.
            iAlpha1:          1,                          //Alpha1 " "
            iAlpha2:          1,                          //Alpha2 " "
            iBeta:            1,                          //Beta " "
            iGamma:           1,                          //Low Gamma (30-45Hz) " "
            iThetaBeta:       1,                          //Theta/Beta ratio
            iAlpha1Alpha2:    1,                          //Alpha1/Alpha2 ratio
            iAlphaBeta:       1,                          //Alpha/Beta ratio
            i40Hz:            1,                          //40Hz bandpower
            iFrontalAlpha1Coherence: 0                           //Alpha 1 coherence, typically between 0 and 1 and up, 0.9 and up is a strong correlation
        };

        this.uniformSettings = {
            iAudio:           {default: new Array(256).fill(0), min:0,max:255},              //Audio analyser FFT, array of 256, values max at 255
            iHRV:             {default:1, min:0, max:40,step:0.5},                           //Heart Rate Variability (values typically 5-30)
            iHEG:             {default:0, min:-3, max:3,step:0.1},                           //HEG change from baseline, starts at zero and can go positive or negative
            iHR:              {default:1, min:1, max:240,step:1},                            //Heart Rate in BPM
            iHB:              {default:0, min:0, max:1},                                     //Is 1 when a heart beat occurs, falls off toward zero on a 1/t curve (s)
            iBRV:             {default:1, min:0, max:10,step:0.5},                           //Breathing rate variability, usually low, ideal is 0.
            iFFT:             {default:new Array(256).fill(0),min:0,max:1000},               //Raw EEG FFT, array of 256. Values *should* typically be between 0 and 100 (for microvolts) but this can vary a lot so normalize or clamp values as you use them
            iDelta:           {default:1, min:0, max:100,step:0.5},                          //Delta bandpower average. The following bandpowers have generally decreasing amplitudes with frequency.
            iTheta:           {default:1, min:0, max:100,step:0.5},                          //Theta bandpower average.
            iAlpha1:          {default:1, min:0, max:100,step:0.5},                          //Alpha1 " "
            iAlpha2:          {default:1, min:0, max:100,step:0.5},                          //Alpha2 " "
            iBeta:            {default:1, min:0, max:100,step:0.5},                          //Beta " "
            iGamma:           {default:1, min:0, max:100,step:0.5},                          //Low Gamma (30-45Hz) " "
            iThetaBeta:       {default:1, min:0, max:5,step:0.1},                            //Theta/Beta ratio
            iAlpha1Alpha2:    {default:1, min:0, max:5,step:0.1},                            //Alpha1/Alpha2 ratio
            iAlphaBeta:       {default:1, min:0, max:5,step:0.1},                            //Alpha/Beta ratio
            iAlphaTheta:      {default:1, min:0, max:5,step:0.1},
            i40Hz:            {default:1, min:0, max:10,step:0.1},                           //40Hz bandpower
            iFrontalAlpha1Coherence: {default:0, min:0, max:1.1,step:0.1}                           //Alpha 1 coherence, typically between 0 and 1 and up, 0.9 and up is a strong correlation
        };

        this.defaultUniforms = {iResolution: {value: 'auto'}, iTime: {value: 0}}

        this.shaders = {
            galaxy: {
                name: 'Galaxy',
                vertexShader: vertexShader,
                fragmentShader: galaxyFragmentShader,
                uniforms: ['iAudio','iHRV','iHEG','iHB','iHR','iFrontalAlpha1Coherence', 'iFFT'],
                credit: 'JoshP (Shadertoy)'
            },
            negagalaxy: {
                name: 'Nega Galaxy',
                vertexShader: vertexShader,
                fragmentShader: negaGalaxyFragmentShader,
                uniforms: ['iAudio','iHRV','iHEG','iHB','iHR','iFrontalAlpha1Coherence'],
                credit: 'JoshP (Shadertoy) * JoshB'
            },
            waves: {
                name: 'Rainbow Waves',
                vertexShader: vertexShader,
                fragmentShader: wavesFragmentShader,
                uniforms: ['iFrontalAlpha1Coherence','iHEG','iHRV'],
                credit: 'Pixi.js'
            },
            noisecircle: {
                name: 'Noise Circle',
                vertexShader: vertexShader,
                fragmentShader: noiseCircleFragmentShader,
                uniforms: ['iFrontalAlpha1Coherence','iHEG','iHRV'],
                credit: 'Garrett Flynn'
            },
            creation: {
                name: 'Creation',
                vertexShader: vertexShader,
                fragmentShader: creationFragmentShader,
                uniforms: ['iFrontalAlpha1Coherence','iHEG','iHRV'],
                credit: 'Danilo Guanabara (Shadertoy)'
            },
            voronoiblobs: {
                name: 'Voronoi Blobs',
                vertexShader: vertexShader,
                fragmentShader: blobFragmentShader,
                uniforms: [],
                credit: 'Elise (Shadertoy)'
            },
        }

        this.brainMetrics = [
            {name:'delta',label: 'Delta', color: [0,0.5,1]}, // Blue-Cyan
            {name:'theta',label: 'Theta',color: [1,0,1]}, // Purple
            {name:'alpha1',label: 'Low Alpha',color:[0,1,0]}, // Green
            {name:'alpha2',label: 'High Alpha',color: [0,1,0]}, // Green
            {name:'beta',label: 'Beta',color: [1,1,0]}, // Yellow
            {name:'lowgamma',label: 'Gamma',color: [1,0,0]} // Red
        ]

        this.brainData = []   
        this.lastColorSwitch=Date.now() 

        this.history = 5; 
    }

    //---------------------------------
    //---Required template functions---
    //---------------------------------

    //Initalize the app with the DOMFragment component for HTML rendering/logic to be used by the UI manager. Customize the app however otherwise.
    init() {


        //HTML render function, can also just be a plain template string, add the random ID to named divs so they don't cause conflicts with other UI elements
        let HTMLtemplate = (props=this.props) => { 
            return `
            <div id='${props.id}' style='height:100%; width:100%; position: relative; max-height: 100vh;'>
                            
                <button id='`+props.id+`showhide' style='position:absolute; top: 0px; z-index:2; opacity:1;'>Hide Controls</button> 

                <div id='`+props.id+`menu' style='display: flex; transition: 0.5s; max-height: 100%; padding: 25px; position: absolute; top: 0; left: 0; width: 100%; z-index: 1;overflow: hidden; background: rgba(0,0,0,0.0); height: 100%;'>
                    <div>
                        <div class='guiContainer' style="position:absolute; bottom: 0px; left: 0px; z-index: 2;"></div>
                        <div style="display: flex; align-items: center;">
                            <h3 style='text-shadow: 0px 0px 2px black, 0 0 10px black;'>Effects</h3>
                            <button id='${props.id}addeffect' style="background: black; color: white; margin: 25px 10px;">+</button>
                        </div>
                        <div id='${props.id}effectmenu'></div>
                    </div>
                    <div id='${props.id}textshader' style='height: 100%; width: 100%; padding: 25px;'>
                        <div style='text-shadow: 0px 0px 2px black, 0 0 10px black; display:flex; align-items: center; justify-content: space-between;'>
                            <div id='${props.id}shaderheader' style='display:none;'>
                                <h3>Fragment Shader</h3>
                                <button id='${props.id}quickreftog'>Reference</button><button id='${props.id}saveShader'>Try It Out</button><span style="font-size: 80%;">   Or use CTRL + S</span>
                            </div>
                            <div>
                                <select id='${props.id}shaderSelector'>
                                </select>
                                <button id='${props.id}editshader'>Edit</button>
                            </div>
                        </div>
                        <div id='${props.id}shadereditor' style="position: relative; width: 100%; height: 100%; display:none;">
                            <div id='${props.id}quickref' style='position:absolute; background-color:white; color:black; z-index:10; display:none; font-size:16px bold; height:80%; overflow-y:scroll;'>
                                <style>
                                    table tr th {
                                        border: 2px solid black;
                                    }
                                    table tr td {
                                        border: 1px solid black;
                                    }
                                </style>
                                Quick Reference Sheet:
                                <table style='font-size:12px;'>
                                    <tr><th width='30%'>Uniforms</th><th width='20%'>Ranges</th><th width='50%'>Descriptions</th></tr>
                                    <tr><td>uniform float iAudioFFT[256]</td><td>0-255</td><td>Audio power spectrum, higher index = higher frequencies</td></tr>
                                    <tr><td>uniform float iHEG</td><td>-5-+5 typical</td><td>HEG smoothed ratio score, begins at 0</td></tr>
                                    <tr><td>uniform float iHRV</td><td>0-50(bpm change)</td><td>Heart Rate Variability</td></tr>
                                    <tr><td>uniform float iHR</td><td>30-200(bpm)</td><td>Heart Rate</td></tr>
                                    <tr><td>uniform float iHB</td><td>0-1</td><td>Heart Beat, is 1 when heartbeat occurs and falls off to 0 at 1/sec speed </td></tr>
                                    <tr><td>uniform float iBRV</td><td>0-10</td><td>Breathing Rate Variability, lower is better</td></tr>
                                    <tr><td>uniform float iFFT[256]</td><td>0-150(uV) typical</td><td>EEG Power spectrum 0-128Hz, higher frequencies have much lower values</td></tr>
                                    <tr><td>uniform float iFrontalAlpha1Coherence</td><td>0-1 typical</td><td>Alpha 1 Mean Squared Coherence</td></tr>
                                    <tr><td>uniform float iDelta</td><td>0-50(uV) typical</td><td>Mean Delta Bandpower</td></tr>
                                    <tr><td>uniform float iTheta</td><td>0-50(uV) typical</td><td>Mean Theta Bandpower</td></tr>
                                    <tr><td>uniform float iAlpha1</td><td>0-10(uV) typical</td><td>Mean Alpha1 Bandpower</td></tr>
                                    <tr><td>uniform float iAlpha2</td><td>0-10(uV) typical</td><td>Mean Alpha2 Bandpower</td></tr>
                                    <tr><td>uniform float iBeta</td><td>0-10(uV) typical</td><td>Mean Beta Bandpower</td></tr>
                                    <tr><td>uniform float iGamma</td><td>0-5(uV) typical</td><td>Mean Low Gamma (30-45Hz) Bandpower</td></tr>
                                    <tr><td>uniform float i40Hz</td><td>0-5(uV) typical</td><td>40Hz Gamma Bandpower</td></tr>
                                    <tr><td>uniform float iAlphaTheta</td><td>0-10</td><td>Alpha/Theta Bandpower Ratio</td></tr>
                                    <tr><td>uniform float iAlpha1Alpha2</td><td>0-10</td><td>Alpha1/Alpha2 Bandpower Ratio</td></tr>
                                    <tr><td>uniform float iAlphaBeta</td><td>0-10</td><td>Alpha/Beta Bandpower Ratio</td></tr>
                                    <tr><td>uniform float iThetaBeta</td><td>0-10</td><td>Theta/Beta Bandpower Ratio</td></tr>
                                </table>
                            </div>
                            <textarea id='${props.id}fragmentshader' class="brainsatplay-code-editing" spellcheck="false" placeholder='Write GLSL Fragment Shader Code' 
                            style=''></textarea>
                            <pre class="brainsatplay-code-highlighting" aria-hidden="true">
                                <code class="language-glsl brainsatplay-code-highlighting-content"></code>
                            </pre>
                        </div>
                    </div>
                </div>

                <div id='${props.id}container' style="height:100%; width:100%;">
                </div>
            </div>  
                                        
            `;
        }

        //HTML UI logic setup. e.g. buttons, animations, xhr, etc.
        let setupHTML = (props=this.props) => {

            this.appletContainer = document.getElementById(props.id);
            this.tutorialManager.updateParent(this.appletContainer)

            this.session.createIntro(this, () => {
                this.tutorialManager.init()
            })


            // Shader Live Coding
            // Code Editor from https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/
            let check_tab = (element, event) => {
                let code = element.value;
                if(event.key == "Tab") {
                    /* Tab key pressed */
                    event.preventDefault(); // stop normal
                    let before_tab = code.slice(0, element.selectionStart); // text before tab
                    let after_tab = code.slice(element.selectionEnd, element.value.length); // text after tab
                    let cursor_pos = element.selectionEnd + 1; // where cursor moves after tab - 2 for 2 spaces
                    element.value = before_tab + "\t" + after_tab; // add tab char - 2 spaces
                    // move cursor
                    element.selectionStart = cursor_pos;
                    element.selectionEnd = cursor_pos;

                    // Trigger Update Function
                    var event = document.createEvent("Event");
                    event.initEvent("input", true, true);
                    element.dispatchEvent(event);
                }
            }

                          
            let update = (el) => {
                let result_element = document.body.querySelector(`.brainsatplay-code-highlighting-content`);
                
                let text = el.value
                let replacedText = text.replace(new RegExp("\&", "g"), "&amp").replace(new RegExp("\<", "g"), "&lt;");
                // Update code
                result_element.innerHTML = replacedText

                // Syntax Highlight
                Prism.highlightElement(result_element);
            }

            let sync_scroll = (element) => {
                /* Scroll result to scroll coords of event - sync with textarea */
                let result_element = document.querySelector(".brainsatplay-code-highlighting");
                // Get and set x and y
                result_element.scrollTop = element.scrollTop;

                // If the scroll limit has been reached, flip the synchronization
                if (result_element.scrollTop < element.scrollTop) element.scrollTop = result_element.scrollTop

                result_element.scrollLeft = element.scrollLeft;
              }

            let fragShaderInput = document.getElementById(props.id+'fragmentshader')
            fragShaderInput.oninput = () => {
                update(fragShaderInput)
                sync_scroll(fragShaderInput)

                // ENABLE TO UPDATE EVERY TIME THE INPUT CHANGES
                // this.setShaderFromText(fragShaderInput.value);
            }

            this.onKeyDown = (e) => {
                if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)  && e.keyCode == 83) {
                    e.preventDefault();
                    this.setShaderFromText(fragShaderInput.value);
                }
            }

            document.getElementById(props.id+'quickreftog').onclick = () => {
                if(this.quickrefhidden) {
                    document.getElementById(props.id+'quickref').style.display = '';
                    this.quickrefhidden = false;
                }
                else {
                    document.getElementById(props.id+'quickref').style.display = 'none';
                    this.quickrefhidden = true;
                }
            }

            document.getElementById(props.id+'saveShader').onclick = () => {
                this.setShaderFromText(fragShaderInput.value);
            }

            document.addEventListener("keydown", this.onKeyDown, false);

            fragShaderInput.onscroll = () => {
                sync_scroll(fragShaderInput)
            }

            fragShaderInput.onkeydown = (e) => {
                check_tab(fragShaderInput,e)
            }

            /**
             * GUI
             */
            this.canvasContainer = document.getElementById(props.id+'container')
            this.gui = new GUI({ autoPlace: false });
            this.appletContainer.querySelector('.guiContainer').appendChild(this.gui.domElement);

            document.getElementById(props.id+'editshader').onclick = () => {
                if(this.editorhidden === false) {
                    document.getElementById(props.id+'shaderheader').style.display = 'none';
                    document.getElementById(props.id+'shadereditor').style.display = 'none';
                    this.editorhidden = true;
                } else {
                    document.getElementById(props.id+'shaderheader').style.display = '';
                    document.getElementById(props.id+'shadereditor').style.display = '';
                    this.editorhidden = false;
                }
            }

            document.getElementById(props.id+'addeffect').onclick = () => {
                this.addSoundInput();
                console.log('clicked to add sound input')
            };

            let selector = document.getElementById(`${this.props.id}shaderSelector`)
            Object.keys(this.shaders).forEach((k) => {
                selector.innerHTML += `<option value='${k}'>${this.shaders[k].name}</option>`
            });
            selector.innerHTML += `<option value='fromtext'>Blank Shader</option>`
            
            this.currentShader = this.shaders[selector.value];
            this.swapShader();
            
            
            selector.onchange = (e) => {
                if (e.target.value === 'fromtext') {
                    // document.getElementById(props.id+'textshader').style.display = '';
                    
                document.getElementById(props.id+'fragmentshader').value = `
#define FFTLENGTH 256
precision mediump float;
uniform vec2 iResolution; //Shader display resolution
uniform float iTime; //Shader time increment

uniform float iHEG;
uniform float iHRV;
uniform float iHR;
uniform float iHB;
uniform float iFrontalAlpha1Coherence;
uniform float iFFT[FFTLENGTH];
uniform float iAudio[FFTLENGTH];
void main(){
    gl_FragColor = vec4(iAudio[20]/255. + iHEG*0.1+gl_FragCoord.x/gl_FragCoord.y,gl_FragCoord.y/gl_FragCoord.x,gl_FragCoord.y/gl_FragCoord.x - iHEG*0.1 - iAudio[120]/255.,1.0);
}                    
`;
                    document.getElementById(props.id+'fragmentshader').oninput();
                    document.getElementById(props.id+'shaderheader').style.display = '';
                    document.getElementById(props.id+'shadereditor').style.display = '';
                    this.editorhidden = false;
                }
                else if (e.target.value != 'Gallery'){
                    this.currentShader = this.shaders[selector.value]
                    this.swapShader();
                    this.setEffectOptions();
                } else {
                    // document.getElementById(props.id+'textshader').style.display = 'none';
                }
            }

            let showhide = document.getElementById(props.id+'showhide');
            let menu = document.getElementById(props.id+"menu")
            showhide.onclick = () => {
                if(this.hidden == false) {
                    this.hidden = true;
                    menu.style.maxHeight = "0";
                    menu.style.padding = "0% 25px"
                    document.getElementById(props.id+"showhide").innerHTML = "Show Controls";
                    // document.getElementById(props.id+'addeffect').style.display = "none";
                    // document.getElementById(props.id+'effectmenu').style.display = "none";
                    // document.getElementById(props.id+'shaderSelector').style.display = "none";
                    // this.appletContainer.querySelector('.guiContainer').style.display = "none";
                    // document.getElementById(props.id+'Micin').style.display = "none";
                }
                else{
                    this.hidden = false;
                    menu.style.maxHeight = "100%";
                    menu.style.padding = '25px'
                    document.getElementById(props.id+"showhide").innerHTML = "Hide Controls";
                    document.getElementById(props.id+'addeffect').style.display = "";
                    document.getElementById(props.id+'effectmenu').style.display = "";
                    document.getElementById(props.id+'shaderSelector').style.display = "";
                    this.appletContainer.querySelector('.guiContainer').style.display = "";
                }
            }

            showhide.onmouseover = () => {
                showhide.style.opacity = 1.0;
            }
            showhide.onmouseleave = () => {
                showhide.style.opacity = 0.2;
            }
        }


        this.AppletHTML = new DOMFragment( // Fast HTML rendering container object
            HTMLtemplate,       //Define the html template string or function with properties
            this.parentNode,    //Define where to append to (use the parentNode)
            this.props,         //Reference to the HTML render properties (optional)
            setupHTML,          //The setup functions for buttons and other onclick/onchange/etc functions which won't work inline in the template string
            undefined,          //Can have an onchange function fire when properties change
            "NEVER"             //Changes to props or the template string will automatically rerender the html template if "NEVER" is changed to "FRAMERATE" or another value, otherwise the UI manager handles resizing and reinits when new apps are added/destroyed
        );  

        if(this.settings.length > 0) { this.configure(this.settings); } //You can give the app initialization settings if you want via an array.


        //Add whatever else you need to initialize
        this.looping = true;
        
        this.ct = 0;



    // Multiplayer
    this.stateIds.push(this.session.streamAppData('modifiers', this.modifiers, (newData) => {
        //console.log('new data!')
    }));


    /**
     * Scene
     */
    this.three.scene = new THREE.Scene()

    /**
     * Camera
     */

    this.baseCameraPos = new THREE.Vector3(0,0,3)
    this.camera = new THREE.PerspectiveCamera(75, this.canvasContainer.offsetWidth/this.canvasContainer.offsetHeight, 0.01, 1000)
    this.camera.position.z = this.baseCameraPos.z//*1.5

    /**
     * Texture Params
     */

    let containerAspect = this.canvasContainer.offsetWidth/this.canvasContainer.offsetHeight //this.appletContainer.offsetWidth/this.appletContainer.offsetHeight
    this.fov_y = this.camera.position.z * this.camera.getFilmHeight() / this.camera.getFocalLength();

    // Square
    //  this.three.meshWidth = this.three.meshHeight = Math.min(((fov_y)* this.camera.aspect) / containerAspect, (fov_y)* this.camera.aspect);

    // Fit Screen
    this.three.meshWidth = this.fov_y * this.camera.aspect
    this.three.meshHeight = this.three.meshWidth/containerAspect

    // Renderer
    this.three.renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
    this.three.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    this.three.renderer.setSize( this.canvasContainer.offsetWidth, this.canvasContainer.offsetHeight );
    this.canvasContainer.appendChild( this.three.renderer.domElement );
    this.three.renderer.domElement.style.width = '100%'
    this.three.renderer.domElement.style.height = '100%'
    this.three.renderer.domElement.id = `${this.props.id}canvas`
    this.three.renderer.domElement.style.opacity = '0'
    this.three.renderer.domElement.style.transition = 'opacity 1s'

    // Controls
    this.controls = new OrbitControls(this.camera, this.three.renderer.domElement)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.enabled = false;
    this.controls.minPolarAngle = 2*Math.PI/6; // radians
    this.controls.maxPolarAngle = 4*Math.PI/6; // radians
    this.controls.minDistance = this.baseCameraPos.z; // radians
    this.controls.maxDistance = this.baseCameraPos.z*10; // radians

    // Plane
    const planeGeometry = new THREE.PlaneGeometry(this.three.meshWidth, this.three.meshHeight, 1, 1);
    let tStart = Date.now();

    let shaderKeys = Object.keys(this.shaders);
    let numShaders = shaderKeys.length;

    this.defaultUniforms.iResolution = {value: new THREE.Vector2(this.three.meshWidth, this.three.meshHeight)}, //Required for ShaderToy shaders
    
    shaderKeys.forEach((k,i) => {

        if (i === 0){
            let material = new THREE.ShaderMaterial({
                transparent: true,
                side: THREE.DoubleSide,
                vertexShader: this.shaders[k].vertexShader,
                fragmentShader: this.shaders[k].fragmentShader,
                uniforms: {...this.defaultUniforms}// Default Uniforms 
            });

            let radius = 0;//10
            let plane = new THREE.Mesh(planeGeometry, material)
            plane.name = k
            let angle = (2 * Math.PI * i/numShaders) - Math.PI/2
            plane.position.set(radius*(Math.cos(angle)),0,radius*(Math.sin(angle)))
            plane.rotation.set(0,-angle - Math.PI/2,0)
            this.three.planes.push(plane)
            this.three.scene.add(plane)
        }
    });

        // Animate
        this.startTime = Date.now() - Math.random()*1000000;
        this.render = () => {
            if (this.three.renderer.domElement != null){

                let userData = this.session.getBrainstormData(this.info.name, this.streams)
                //console.log(userData)
                if (userData.length > 0){
                    let averageModifiers = {};
                    userData.forEach((data) => {
                       if (data.modifiers){
                            // Only average watched values
                            this.currentShader.uniforms.forEach(name => {
                                if (averageModifiers[name] == null) averageModifiers[name] = []

                                if (data.modifiers[name] != null && data.modifiers[name].constructor === Uint8Array) {
                                    data.modifiers[name] = Array.from(data.modifiers[name])
                                }
                                averageModifiers[name].push(data.modifiers[name])
                            });
                        }
                    })

                    for (let mod in averageModifiers){
                        if (!Array.isArray(averageModifiers[mod][0])) averageModifiers[mod] = this.session.atlas.mean(averageModifiers[mod])
                        else { // Average across each sample (e.g. FFTs)
                            let newArr = Array(averageModifiers[mod][0].length)
                            for (let i = 0; i < newArr.length; i++){
                                let sampleAve = []
                                averageModifiers[mod].forEach(a => {
                                    sampleAve.push(a[i])
                                })
                                newArr[i] = this.session.atlas.mean(sampleAve)
                            }
                            averageModifiers[mod] = newArr
                        }
                    }

                    let neosensoryBuzz = this.session.getDevice('buzz')
                    if (neosensoryBuzz){
                        this.updateBuzz( neosensoryBuzz.device, averageModifiers)
                    }

                    this.three.planes.forEach(p => {
                        this.updateMaterialUniforms(p.material,averageModifiers);
                    });

                    this.controls.update()
                    this.three.renderer.render( this.three.scene, this.camera );
                
                }
            }
        };

        this.three.renderer.setAnimationLoop( this.render );
        this.animate();

        setTimeout(() => {
            this.three.renderer.domElement.style.opacity = '1'
            // this.controls.enabled = true;
        }, 100)
        
        document.getElementById(this.props.id+'addeffect').click();
    }

    //Delete all event listeners and loops here and delete the HTML block
    deinit() {
        this.looping = false;
        this.effects.forEach((struct,idx)=>{
            if(struct.id === 'Micin') {
                struct.source.mediaStream.getTracks()[0].stop();
            }
            else if(struct.sourceIdx) window.audio.stopSound(struct.sourceIdx);
            
        });

        this.tutorialManager.deinit()

        document.removeEventListener("keydown", this.saveShader);


        this.stateIds.forEach(id => {
            this.session.state.unsubscribeAll(id);
        })
        this.three.renderer.setAnimationLoop( null );
        this.clearThree()
        this.AppletHTML.deleteNode();
        //Be sure to unsubscribe from state if using it and remove any extra event listeners
    }

    createTutorial = (props=this.props) => {
        let tooltips = [
            {
                target: `${props.id}effectmenu`,
                content: `
                <h3>Choose your Effects</h3>
                <hr>
                <p>This is where you choose feedback effects, they will be applied
                if a data stream is available. For audio feedback select 'Audio FFT' and a sound, or use your Microphone!</p>
                `
            }, 
            {
                target: `${props.id}shadereditor`,
                content: `
                <h3>Real-Time Shader Coding</h3>
                <hr>
                <p>Modify the visualization in real-time—or select from our default shaders.</p>
                `
            },
          ]

          return new TutorialManager(this.info.name, tooltips, this.appletContainer)
    }

    //Responsive UI update, for resizing and responding to new connections detected by the UI manager
    responsive() {

        this.tutorialManager.responsive()

        if(this.three.renderer) {
            this.camera.aspect = this.canvasContainer.offsetWidth/this.canvasContainer.offsetHeight
            this.camera.updateProjectionMatrix()
            // Resize Plane Geometry
            let containerAspect = this.canvasContainer.offsetWidth/this.canvasContainer.offsetHeight
            // let fov_y = this.camera.position.z * this.camera.getFilmHeight() / this.camera.getFocalLength();
            // this.three.meshWidth = this.three.meshHeight = Math.min(((fov_y)* this.camera.aspect) / containerAspect, (fov_y)* this.camera.aspect);
            this.three.meshWidth = this.fov_y * this.camera.aspect
            this.three.meshHeight = this.three.meshWidth/containerAspect

            let newGeometry = new THREE.PlaneGeometry(this.three.meshWidth, this.three.meshHeight, 1, 1)
            this.three.planes.forEach(p => {
                p.geometry.dispose()
                p.geometry = newGeometry
                p.material.uniforms.iResolution.value = new THREE.Vector2(this.three.meshWidth, this.three.meshHeight)
            })
            
            this.three.renderer.setSize(this.canvasContainer.offsetWidth, this.canvasContainer.offsetHeight);
        }
        
    }

    configure(settings=[]) { //For configuring from the address bar or saved settings. Expects an array of arguments [a,b,c] to do whatever with
        settings.forEach((cmd,i) => {
            //if(cmd === 'x'){//doSomething;}
        });
    }

    //--------------------------------------------
    //--Add anything else for internal use below--
    //--------------------------------------------

    addSoundInput = () => {
        let fileinput = (idx=0, props=this.props) => {
            return `
            <div style="display: flex;">

                <div style="padding-right: 25px;">
                    <h4 style='text-shadow: 0px 0px 2px black, 0 0 10px black;'>Effect</h4>
                    <div id='${props.id}selectors${idx}'></div>
                </div>
                <div class="sound">
                    <h4 style='text-shadow: 0px 0px 2px black, 0 0 10px black;'>Sound</h4>
                    <div id='${props.id}fileWrapper${idx}' style="">  
                        <select id='${props.id}soundselect${idx}'><option value='none' disabled>Choose an Audio Source</option></select> 
                        <span id='${props.id}status${idx}'></span>
                    </div>
                    <span id='${props.id}fileinfo${idx}' style='text-shadow: 0px 0px 2px black, 0 0 10px black; display:none;'>Loading...</span>
                </div>
                </div>
            `;
        }

        let controls = (idx=0, props=this.props) => {
            return `
                <span id='${props.id}controlWrapper${idx}'>
                    <button id='${props.id}play${idx}'>Play</button>
                    <button id='${props.id}pause${idx}' style='display:none;'>Pause</button>
                    <button id='${props.id}mute${idx}' style='display:none;'>Mute</button>
                    <button id='${props.id}stop${idx}'>Remove</button>
                </span>
            `;
        }
        
        let fdback = (idx=0, props=this.props) => {
            return `
            <select id='${props.id}select${idx}'>
                <option value='none'>None</option>
                <option value='iAudio'>Audio FFT</option>
                <option value='iHB'>Heart Beat</option>
                <option value='iHR'>Heart Rate</option>
                <option value='iHEG'>HEG Ratio</option>
                <option value='iHRV'>Heart Rate Variability</option>
                <option value='iBRV'>Breathing Rate Variability</option>
                <option value='iFFT'>EEG Bandpower FFT</option>
                <option value='iDelta'>Delta Bandpower</option>
                <option value='iTheta'>Theta Bandpower</option>
                <option value='iAlpha1'>Alpha1 Bandpower</option>
                <option value='iAlpha2'>Alpha2 Bandpower</option>
                <option value='iBeta'>Beta Bandpower</option>
                <option value='iGamma'>Low Gamma Bandpower</option>
                <option value='i40Hz'>40Hz Bandpower</option>
                <option value='iThetaBeta'>Theta/Beta Ratio</option>
                <option value='iAlpha1Alpha2'>Alpha 2/1 Ratio</option>
                <option value='iAlphaBeta'>Alpha/Beta Ratio</option>
                <option value='iAlphaTheta'>Alpha/Theta Ratio</option>
                <option value='iFrontalAlpha1Coherence'>Frontal Alpha Coherence</option>
            </select>
            <select id='${props.id}channel${idx}' style='display:none;'></select>
            `;
        }

        let idx = this.ct; this.ct++;

        let newEffect = JSON.parse(JSON.stringify(this.effectStruct));
        this.effects.push(newEffect);
        newEffect.uiIdx = idx;
        
        document.getElementById(this.props.id+'effectmenu').insertAdjacentHTML('beforeend',`<div id='${this.props.id}effectWrapper${idx}'>`+fileinput(idx)+`</div>`);
        newEffect.input = document.getElementById(this.props.id+'fileWrapper'+idx);

        document.getElementById(this.props.id+'selectors'+newEffect.uiIdx).insertAdjacentHTML('beforeend',fdback(idx));
        newEffect.feedback = document.getElementById(this.props.id+'select'+newEffect.uiIdx)
        console.log(newEffect.feedback.value)

        document.getElementById(this.props.id+'select'+newEffect.uiIdx).onchange = () => {
            let value = document.getElementById(this.props.id+'select'+newEffect.uiIdx).value;
            newEffect.feedbackOption = value;

            if(value.includes('eeg')){
                document.getElementById(this.props.id+'channel'+newEffect.uiIdx).style.display = "";
                if(value.includes('coh')) {
                    addCoherenceOptions(this.props.id+'channel'+newEffect.uiIdx,this.session.atlas.data.coherence);
                } else {
                    addChannelOptions(this.props.id+'channel'+newEffect.uiIdx,this.session.atlas.data.eegshared.eegChannelTags);
                }
            } else if (value.includes('heg')) {
                document.getElementById(this.props.id+'channel'+newEffect.uiIdx).style.display = "none";
            } 
            
            let fileWrapper = document.getElementById(`${this.props.id}fileWrapper${newEffect.uiIdx}`)
            //console.log(value)
            
        }

        document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).innerHTML += `<option value='none'>None</option>`;
        document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).innerHTML += `<option value='micin'>Mic In</option>`;

        this.soundUrls.forEach((obj)=>{
            document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).innerHTML += `<option value='${obj.url}'>${obj.name}</option>`;
        });

        document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).innerHTML += `<option value='addfile'>Add Custom File</option>`;


        document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).onchange = () => {
            let soundurl = document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).value;
                        
            let idx = undefined;
            let found = this.effects.find((o,i) => {
                if(o.id === 'Micin') {
                    idx=i;
                    return true;
                }
            });

            if (soundurl === 'micin'){
                if(!found){
                    //start mic
                    if(!window.audio) {
                        window.audio = new SoundJS();
                        if (window.audio.ctx===null) {return;};
                    }
                    this.effects.push(JSON.parse(JSON.stringify(this.effectStruct)));
                    let fx = this.effects[this.effects.length-1];

                    fx.sourceIdx = window.audio.record(undefined,undefined,null,null,false,()=>{
                        if(fx.sourceIdx !== undefined) {
                            fx.source = window.audio.sourceList[window.audio.sourceList.length-1];
                            //window.audio.sourceGains[fx.sourceIdx].gain.value = 0;
                            fx.playing = true;
                            fx.feedbackOption = 'iAudio';
                            fx.id = 'Micin';
                            //fx.source.mediaStream.getTracks()[0].enabled = false;
                        }
                    });
                }
            } else if (found != null){
                found.source.mediaStream.getTracks()[0].stop();
                this.effects.splice(idx,1);
            } 

            if (!['micin', 'none'].includes(soundurl)) {
                if (soundurl === 'addfile') {

                    if(!window.audio) window.audio = new SoundJS();
                    if (window.audio.ctx===null) {return;};
        
                    window.audio.decodeLocalAudioFile((sourceListIdx)=>{ 
                        
                        document.getElementById(this.props.id+'fileinfo'+newEffect.uiIdx).style.display = 'none';
                        document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).selectedIndex = 0;
        
                        if(!newEffect.controls) {
                            document.getElementById(this.props.id+'effectWrapper'+newEffect.uiIdx).querySelector('.sound').insertAdjacentHTML('beforeend',controls(newEffect.uiIdx));
                            newEffect.controls = document.getElementById(this.props.id+'controlWrapper'+newEffect.uiIdx);
                        } else {newEffect.controls.style.display=""}
                        newEffect.source = window.audio.sourceList[sourceListIdx]; 
                        newEffect.sourceIdx = sourceListIdx;
                        document.getElementById(this.props.id+'status'+newEffect.uiIdx).innerHTML = "Loading..." 
        
                        this.loadSoundControls(newEffect);
                        document.getElementById(this.props.id+'status'+newEffect.uiIdx).innerHTML = "";
                    }, 
                    ()=> { 
                        console.log("Decoding...");
                        newEffect.input.style.display='none';
                        document.getElementById(this.props.id+'fileinfo'+newEffect.uiIdx).style.display = '';
                    });
                } else {
                    
                    if(!window.audio) window.audio = new SoundJS();
                    if (window.audio.ctx===null) {return;};

                    window.audio.addSounds(soundurl,(sourceListIdx)=>{ 
                    
                        document.getElementById(this.props.id+'fileinfo'+newEffect.uiIdx).style.display = 'none';
                        document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).selectedIndex = 0;

                        if(!newEffect.controls) {
                            document.getElementById(this.props.id+'effectWrapper'+newEffect.uiIdx).querySelector('.sound').insertAdjacentHTML('beforeend',controls(newEffect.uiIdx));
                            newEffect.controls = document.getElementById(this.props.id+'controlWrapper'+newEffect.uiIdx);
                        } else {newEffect.controls.style.display=""}
                        newEffect.source = window.audio.sourceList[sourceListIdx]; 
                        newEffect.sourceIdx = sourceListIdx;
                        document.getElementById(this.props.id+'status'+newEffect.uiIdx).innerHTML = "Loading..." 
        
                        this.loadSoundControls(newEffect);
                        document.getElementById(this.props.id+'status'+newEffect.uiIdx).innerHTML = "";
                    }, 
                    ()=> { 
                        console.log("Decoding...");
                        newEffect.input.style.display='none';
                        document.getElementById(this.props.id+'fileinfo'+newEffect.uiIdx).style.display = '';
                    });
                }
            }

        }

        if(this.currentShader !== null)
            this.setEffectOptions();


    //     document.getElementById(this.props.id+'uploadedFile'+idx).onclick = () => {
    //         if(!window.audio) window.audio = new SoundJS();
    //         if (window.audio.ctx===null) {return;};

    //         window.audio.decodeLocalAudioFile((sourceListIdx)=>{ 
                
    //             document.getElementById(this.props.id+'fileinfo'+idx).style.display = 'none';
    //             document.getElementById(this.props.id+'soundselect'+newEffect.uiIdx).selectedIndex = 0;

    //             if(!newEffect.controls) {
    //                 document.getElementById(this.props.id+'effectWrapper'+idx).insertAdjacentHTML('beforeend',controls(idx));
    //                 newEffect.controls = document.getElementById(this.props.id+'controlWrapper'+idx);
    //             } else {newEffect.controls.style.display=""}
    //             newEffect.source = window.audio.sourceList[sourceListIdx]; 
    //             newEffect.sourceIdx = sourceListIdx;
    //             document.getElementById(this.props.id+'status'+idx).innerHTML = "Loading..." 

    //             this.loadSoundControls(newEffect);
    //             document.getElementById(this.props.id+'status'+idx).innerHTML = "";
    //         }, 
    //         ()=> { 
    //             console.log("Decoding...");
    //             newEffect.input.style.display='none';
    //             document.getElementById(this.props.id+'fileinfo'+idx).style.display = '';
    //         });
            
    //     }
        
        
    }

    setEffectOptions() {
        this.effects.forEach((e)=>{
            if(!e.id) {
                let sel = document.getElementById(this.props.id+'select'+e.uiIdx);
                for(let i = 0; i < sel.options.length; i++){
                    if(this.currentShader.uniforms.indexOf(sel.options[i].value)>-1){
                        sel.options[i].style.display='';
                    } else if (sel.options[i].value !== 'none') {
                        sel.options[i].style.display='none';
                    }   
                    if(sel.options[i].selected === true && sel.options[i].style.display==='none') {
                        sel.options[0].selected = true;
                    }
                }
            }
        });
    }

    //doSomething(){}
    loadSoundControls = (newEffect) => {
        
        document.getElementById(this.props.id+'play'+newEffect.uiIdx).onclick = () => {
            try{window.audio.playSound(newEffect.sourceIdx,0,true);}catch(er){}
            //.log(newEffect.sourceIdx);
            newEffect.playing = true;
            document.getElementById(this.props.id+'play'+newEffect.uiIdx).style.display = 'none';
            document.getElementById(this.props.id+'pause'+newEffect.uiIdx).style.display = '';
            document.getElementById(this.props.id+'mute'+newEffect.uiIdx).style.display = '';
        }

        document.getElementById(this.props.id+'pause'+newEffect.uiIdx).onclick = () => {
            if(newEffect.playing) {
                if(!newEffect.paused) {
                    newEffect.paused = true;
                    newEffect.playbackRate = newEffect.source.playbackRate.value;
                    newEffect.source.playbackRate.value = 0;
                    document.getElementById(this.props.id+'pause'+newEffect.uiIdx).innerHTML = "Play";
                } else {
                    newEffect.paused = false;
                    newEffect.source.playbackRate.value = newEffect.playbackRate;
                    document.getElementById(this.props.id+'pause'+newEffect.uiIdx).innerHTML = "Pause";
                }
            }
        }

        document.getElementById(this.props.id+'stop'+newEffect.uiIdx).onclick = () => {
            if(newEffect.playing === false) newEffect.source.start(window.audio.ctx.currentTime);
            newEffect.source.stop();
            
            newEffect.playing = false;
            newEffect.paused = false;
          
           
            newEffect.input.style.display = "";
            newEffect.controls.style.display = "none";

            document.getElementById(this.props.id+'play'+newEffect.uiIdx).style.display = '';
            document.getElementById(this.props.id+'pause'+newEffect.uiIdx).style.display = 'none';
            document.getElementById(this.props.id+'pause'+newEffect.uiIdx).innerHTML = "Pause";

            let thisidx=0;
            this.effects.forEach((effectStruct,j)=> {
                if(!effectStruct.id) {
                    if(effectStruct.sourceIdx === newEffect.sourceIdx) thisidx = j; 
                    else if(effectStruct.sourceIdx > newEffect.sourceIdx) {
                        effectStruct.sourceIdx--;
                        this.loadSoundControls(effectStruct);
                    }
                }
            });


        }

        document.getElementById(this.props.id+'mute'+newEffect.uiIdx).onclick = () => {
            if(window.audio.sourceGains[newEffect.sourceIdx].gain.value !== 0){
                newEffect.lastGain = window.audio.sourceGains[newEffect.sourceIdx].gain.value;
                window.audio.sourceGains[newEffect.sourceIdx].gain.setValueAtTime(0, window.audio.ctx.currentTime);
                newEffect.muted = true;
                
            } else {  newEffect.muted = false; window.audio.sourceGains[newEffect.sourceIdx].gain.setValueAtTime(newEffect.lastGain, window.audio.ctx.currentTime); }
        }
    };

    animate = () => {
        if(this.looping){
            this.effects.forEach((effectStruct) => {
                let option = effectStruct.feedbackOption;
                if(this.session.atlas.data.heg.length>0) {
                    if(option === 'iHB') { //Heart Beat causing tone to fall off
                        if(this.session.atlas.data.heg[0].beat_detect.beats.length > 0) {
                            this.modifiers.iHB = 1/(0.001*(Date.now()-this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].t)) 
                            
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                effectStruct.source
                                window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime( //make the sound fall off on a curve based on when a beat occurs
                                    Math.max(0,Math.min(modifiers.iHB,1)), 
                                    window.audio.ctx.currentTime
                                );
                            } 
                            this.modifiers.iHB = 1/(Date.now()-this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].t) //heart beat gives a decreasing value starting at 1 which signifies when a heart beat occurred
                        }
                    } else if (option === 'iHR') { //Heart rate modifies play speed
                        if(this.session.atlas.data.heg[0].beat_detect.beats.length > 0) {
                            let hr_mod = 60/this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].bpm;
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                effectStruct.source.playbackRate.value = hr_mod;
                            }
                            this.modifiers.iHR = this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].bpm;
                        }
                    }
                        else if (option === 'iHEG') { //Raise HEG ratio compared to baseline
                        if(!effectStruct.hegbaseline) effectStruct.hegbaseline = this.session.atlas.data.heg[0].ratio[this.session.atlas.data.heg[0].ratio.length-1];
                        let hegscore = this.session.atlas.data.heg[0].ratio[this.session.atlas.data.heg[0].ratio.length-1]-effectStruct.hegbaseline;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                Math.min(Math.max(0,hegscore),1), //
                                window.audio.ctx.currentTime
                            );
                        }
                        this.modifiers.iHEG = hegscore; //starts at 0
                    } else if (option === 'iHRV') { //Maximize HRV, set the divider to set difficulty
                        if(this.session.atlas.data.heg[0].beat_detect.beats.length > 0) {
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                    Math.max(0,Math.min(this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].hrv/30,1)), //
                                    window.audio.ctx.currentTime
                                );
                            }
                            this.modifiers.iHRV = this.getData("iHRV");
                        }
                    } else if (option === 'iBRV') { //Minimize BRV, set the divider to set difficulty
                        if(this.session.atlas.data.heg[0].beat_detect.breaths.length > 0) {
                            if(!effectStruct.muted && window.audio && effectStruct.playing){
                                window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                    Math.max(0,Math.min(1/this.session.atlas.data.heg[0].beat_detect.breaths[this.session.atlas.data.heg[0].beat_detect.breaths.length-1].brv,1)), //
                                    window.audio.ctx.currentTime
                                );
                            }
                            this.modifiers.iBRV = this.session.atlas.data.heg[0].beat_detect.breaths[this.session.atlas.data.heg[0].beat_detect.breaths.length-1].brv;
                        }
                    }
                }
                if(this.session.atlas.settings.eeg === true && this.session.atlas.settings.analyzing === true) { 
                    let channel = document.getElementById(this.props.id+'channel'+effectStruct.uiIdx).value;
                    if (option === 'iDelta') {
                        this.modifiers.iDelta = this.session.atlas.getLatestFFTData(channel)[0].mean.delta;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iDelta/50,1)), window.audio.ctx.currentTime); //bandpowers should be normalized to microvolt values, so set these accordingly
                        }
                    } else if (option === 'iTheta') {
                        this.modifiers.iTheta = this.session.atlas.getLatestFFTData(channel)[0].mean.theta;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iTheta/30,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlpha1') {
                        this.modifiers.iAlpha1 = this.session.atlas.getLatestFFTData(channel)[0].mean.alpha1;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlpha1/20,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlpha2') {
                        this.modifiers.iAlpha2 = this.session.atlas.getLatestFFTData(channel)[0].mean.alpha2;
                        if(!effectStruct.muted && window.audio && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlpha2/20,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iBeta') {
                        this.modifiers.iBeta = this.session.atlas.getLatestFFTData(channel)[0].mean.beta;
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iBeta/10,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iGamma') {
                        this.modifiers.iGamma = this.session.atlas.getLatestFFTData(channel)[0].mean.lowgamma;
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iGamma/5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'i40Hz') {
                        this.modifiers.i40Hz = this.session.atlas.get40HzGamma(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.i40Hz*.2,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iThetaBeta') {
                        this.modifiers.iThetaBeta = this.session.atlas.getThetaBetaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iThetaBeta*.5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlpha1Alpha2') {
                        this.modifiers.iAlpha1Alpha2 = this.session.atlas.getAlphaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlpha1Alpha2*.5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlphaBeta') {
                        this.modifiers.iAlphaBeta = this.session.atlas.getAlphaBetaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlphaBeta*.5,1)), window.audio.ctx.currentTime);
                        }
                    } else if (option === 'iAlphaTheta') {
                        this.modifiers.iAlphaTheta = this.session.atlas.getAlphaThetaRatio(this.session.atlas.getEEGDataByChannel(channel))
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(Math.max(0,Math.min(modifiers.iAlphaTheta*.5,1)), window.audio.ctx.currentTime);
                        }      
                    } else if (this.session.atlas.settings.coherence === true && option === 'iFrontalAlpha1Coherence') {
                        this.modifiers.iFrontalAlpha1Coherence = this.session.atlas.getCoherenceScore(this.session.atlas.getFrontalCoherenceData(),'alpha1') // this.session.atlas.getLatestCoherenceData(0)[0].mean.alpha1;
                        if(!effectStruct.muted && window.audio  && effectStruct.playing){
                            window.audio.sourceGains[effectStruct.sourceIdx].gain.setValueAtTime(
                                Math.min(Math.max(0,this.modifiers.iFrontalAlpha1Coherence),1), 
                                window.audio.ctx.currentTime
                            );
                        }
                    } else if (option === 'iFFT') {
                        this.modifiers.iFFT = this.getData("iFFT");
                    } 
                }
                if(option === 'iAudio') {
                    if(!effectStruct.muted && window.audio && effectStruct.playing){
                        var array = new Uint8Array(window.audio.analyserNode.frequencyBinCount);
                        window.audio.analyserNode.getByteFrequencyData(array);
                        this.modifiers.iAudio = array.slice(0,256);
                    } else {
                        this.modifiers.iAudio = new Array(256).fill(0);
                    }
                }
            });

            setTimeout(()=>{requestAnimationFrame(this.animate);},16);
        }
    }

    swapShader = () => {

        let newMaterial = new THREE.ShaderMaterial({
            vertexShader: this.currentShader.vertexShader,
            fragmentShader: this.currentShader.fragmentShader,
            side: THREE.DoubleSide,
            transparent: true,
        });
        
        this.updateMaterialUniforms(newMaterial,this.modifiers);
        this.generateGUI(this.currentShader.uniforms)

        this.three.planes.forEach(p => {
            p.material.dispose();
            p.material = newMaterial;          
        })

        // Update Shader Live Coding Console
        let fragShaderInput = document.getElementById(this.props.id+'fragmentshader')
        
        // Add new lines where expected
        fragShaderInput.value = this.currentShader.fragmentShader
        .replace(new RegExp(";", "g"), ";\n")
        .replace(new RegExp("{", "g"), "{\n")
        .replace(new RegExp("}", "g"), "}\n")
        
        // Trigger update event
        var event = document.createEvent("Event");
        event.initEvent("input", true, true);
        fragShaderInput.dispatchEvent(event);
    }

    setShaderFromText = (text) => {

        let fragShader = text

        // Dynamically Extract Uniforms
        let regex = new RegExp('uniform (.*) (.*);', 'g')
        let result = [...fragShader.matchAll(regex)]
        let alluniforms = []
        result.forEach(a => {
            alluniforms.push(a[2].replace(/(\[.+\])/g, ''))
        })
        let bciuniforms = [];
        alluniforms.forEach((u) => {
            for(const prop in this.modifiers) {
                if(u === prop) {
                    bciuniforms.push(u);
                }
            }
        })
        this.currentShader.uniforms = bciuniforms;

        // Create New Shader
        let newMaterial = new THREE.ShaderMaterial({
            vertexShader: this.currentShader.vertexShader,
            fragmentShader: fragShader,
            side: THREE.DoubleSide,
            transparent: true,
        });
        try{
            this.updateMaterialUniforms(newMaterial,this.modifiers);
            this.generateGUI(this.currentShader.uniforms);

            this.three.planes.forEach(p => {
                p.material.dispose();
                p.material = newMaterial;          
            });

            this.setEffectOptions();
        } catch(er) {}
    }

    getData(u) {        
        if (u === 'iFFT'){
            let channel;
            // if(!ch) {
                channel = this.session.atlas.getLatestFFTData()[0];
            // } else { channel = this.session.atlas.getLatestFFTData(ch); }
            if(channel) return  channel.fft;
            else return new Array(256).fill(0);
        }
        else if (u === 'iHRV'){
            if (this.session.atlas.data.heg.length > 0) return  this.session.atlas.data.heg[0].beat_detect.beats[this.session.atlas.data.heg[0].beat_detect.beats.length-1].hrv; 
            else return 0;
        }
        // Defaults
        else if (u === 'iTime'){
            return  (Date.now() - this.startTime)/1000; // Seconds
        }
        else if (u === 'iResolution'){
            return  new THREE.Vector2(this.three.meshWidth, this.three.meshHeight);
        }
    }

    updateMaterialUniforms = (material,modifiers={}) => {
        let uniformsToUpdate = JSON.parse(JSON.stringify(this.defaultUniforms));
        this.currentShader.uniforms.forEach((u)=> uniformsToUpdate[u]=0);

        for (let name in uniformsToUpdate){
            let value = uniformsToUpdate[name];

            if (material.uniforms[name] == null) material.uniforms[name] = {}

            if (Object.keys(this.defaultUniforms).includes(name)){
                material.uniforms[name].value = this.getData(name)
            } else if (material.uniforms[name]) {
                material.uniforms[name].value = modifiers[name];
            } else {
                material.uniforms[name].value = value;
            }
        }

        return material
    }
    


    /* 
    UI Stuff
    */

    // Clear Three.js Scene Completely
    clearThree(){
        for (let i = this.three.scene.children.length - 1; i >= 0; i--) {
            const object = this.three.scene.children[i];
            if (object.type === 'Mesh') {
                object.geometry.dispose();
                object.material.dispose();
            }
            this.three.scene.remove(object);
        }
        this.three.scene = null;
        this.three.renderer.domElement = null;
        this.three.renderer = null;
    }

    generateGUI(uniforms){
        let updateUniformsWithGUI = (key,value) => {
            this.three.planes.forEach(p => {
                if (p.material.uniforms[key] == null) p.material.uniforms[key] = {};
                p.material.uniforms[key].value = value;
            });
            
        }

        let folders = Object.keys(this.gui.__folders)
        if (!folders.includes('Uniforms')){
            this.gui.addFolder('Uniforms');
        }
        let paramsMenu = this.gui.__folders['Uniforms']

        this.guiControllers.forEach(c => {
            paramsMenu.remove(c)
        })
        this.guiControllers = [];        

        for (let name in this.modifiers){
            if(typeof this.modifiers[name] !== 'object' && uniforms.indexOf(name) > -1){
                this.guiControllers.push(
                    paramsMenu.add(
                        this.modifiers, 
                        name, 
                        this.uniformSettings[name].min,
                        this.uniformSettings[name].max,
                        this.uniformSettings[name].step).onChange(
                            (val) => updateUniformsWithGUI(name,val)));
            }
        }    
    }


    updateBuzz(buzz, modifiers) {
        // console.log(modifiers)
        let motorCommand;

        // if (modifiers.iAudio){
        //     motorCommand = buzz.device.mapFrequencies(modifiers.iAudio)
        //     buzz.device.vibrateMotors([motorCommand])
        // } 
        // else if (modifiers.iFFT){
        //     motorCommand = buzz.device.mapFrequencies(modifiers.iFFT)
        //     buzz.device.vibrateMotors([motorCommand])
        // }

        if (modifiers.iFrontalAlpha1Coherence){
            let i1 = Math.min(modifiers.iFrontalAlpha1Coherence/.33,1)
            let i2 = (i1 === 1 ? Math.min((modifiers.iFrontalAlpha1Coherence-.33)/.33,1) : 0)
            let i3 = (i2 === 1 ? Math.min((modifiers.iFrontalAlpha1Coherence-.66)/.33,1) : 0)
            buzz.device.setLEDs([[0,255,0],[0,255,0],[0,255,0]], [i1,i2,i3])
        }
    }
} 
