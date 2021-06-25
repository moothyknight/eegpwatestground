
import {UI} from './UI.js'
import * as brainsatplay from '../../../libraries/js/brainsatplay'

export const settings = {
    name: "WebXR Playground",
    devices: ["EEG", "HEG"],
    author: "Jack of Hearts",
    description: "Tea",
    categories: ["WIP"],
    instructions:"Coming soon...",
    // intro: {
    //   mode: 'single'
    // },
    
    // App Logic
    graph:
      {
      nodes: [
        {id: 'light', class: brainsatplay.plugins.utilities.Light},
        {id: 'material', class: brainsatplay.plugins.utilities.Material},
        {id: 'geometry', class: brainsatplay.plugins.utilities.Geometry},
        {id: 'vertex', class: brainsatplay.plugins.utilities.VertexShader},
        {id: 'fragment', class: brainsatplay.plugins.utilities.FragmentShader},
        {id: 'sphere', class: brainsatplay.plugins.utilities.Mesh, params:{x:0, y:0, z:0,scale:10}},
        {id: 'scene', class: brainsatplay.plugins.outputs.Scene},
      ],
      edges: [

        // Draw Sphere to Scene
        {
          source: 'geometry', 
          target: 'sphere:geometry'
        },
        {
          source: 'vertex', 
          target: 'material:vertex'
        },
        {
          source: 'fragment', 
          target: 'material:fragment'
        },
        {
          source: 'material', 
          target: 'sphere:material'
        },
        {
          source: 'sphere:add', 
          target: 'scene:add'
        },

        // Draw light to Scene
        {
          source: 'light:add', 
          target: 'scene:add'
        },

      ]
    },
}