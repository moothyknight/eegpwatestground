
import * as THREE from 'three'

// let zoom = 1;
export class UserMarker {
  constructor(settings) {
    this.name = settings.name
    this.latitude = settings.latitude
    this.longitude = settings.longitude
    this.d = settings.diameter;
    this.neurofeedbackDimensions = settings.neurofeedbackDimensions
    this.meshWidth = settings.meshWidth;
    this.meshHeight = settings.meshHeight;
    this.x = this.mercX();
    this.y = this.mercY();
    this.z = 0.05;
    this.geometry;
    this.material;
    this.marker;
    this.prevMarkers = []
    this.prevGroups = []
    this.createMarker()
    this.createHTMLElement()
    this.element = document.querySelector(`.nexus-point-${this.name}`)
    this.active = false;
  }

  createHTMLElement(){
    document.querySelector(`.nexus-point-container`).innerHTML += `
    <div class="nexus-point nexus-point-${this.name}">
      <div class="nexus-label">${this.name}</div>
      <div class="nexus-text">${this.name} is down here. Scroll to zoom in and see.</div>
    </div>
    `
  }

  animateLabel(camera,container){
    let screenPos = new THREE.Vector3(this.x,this.y,this.z)
    let distanceToPoint = screenPos.distanceTo(new THREE.Vector3(
      camera.position.x,
      camera.position.y,
      camera.position.z))
    if (distanceToPoint > 0.1 && this.active){
      this.element.classList.add('visible')
    } else {
      this.element.classList.remove('visible')
    }
    screenPos.project(camera)
    let translateX = container.clientWidth * screenPos.x * 0.5
    let translateY = -container.clientHeight * screenPos.y * 0.5
    this.element.style.transform = `translate(${translateX}px,${translateY}px)`
  }

  updateMesh(meshWidth,meshHeight){
    this.meshWidth = meshWidth;
    this.meshHeight = meshHeight;
    this.x = this.mercX();
    this.y = this.mercY();
    this.createMarker()
  }

  setLatitude(lat){
    this.latitude = lat
    this.y = this.mercY(lat);
  }
  
  setLongitude(lon){
    this.longitude = lon
    this.x = this.mercX(lon);
  }

  setGeolocation(geolocation){
    this.setLatitude(geolocation.latitude)
    this.setLongitude(geolocation.longitude)
    this.createMarker()
  }

  createMarker(){
    // Log old sphere
    if (this.marker != undefined) {this.prevMarkers.push(this.marker)}
    if (this.neurofeedbackGroup != undefined) {this.prevGroups.push(this.neurofeedbackGroup)}

    // Create new sphere
    this.neurofeedbackGroup = new THREE.Group()
    let material = new THREE.MeshBasicMaterial( {color: 0xffffff, opacity: 0.5, transparent: true})
    this.marker = new THREE.Mesh( 
      new THREE.SphereGeometry( this.d,10,10), 
      material 
      );
    this.marker.position.set(this.x, this.y, this.z);
    this.marker.geometry.computeBoundingBox();

    // Neurofeedback elements
    let n = this.neurofeedbackDimensions.length
    let radius = 0.01
    let miniSphereGeometry = new THREE.SphereGeometry( this.d/3,10,10)
    
    for (let i = 0; i < n; i++){
      let miniSphereMaterial = new THREE.MeshBasicMaterial( {color: 0xffffff, opacity: 0.5, transparent: true})
      let miniSphere = new THREE.Mesh(miniSphereGeometry,miniSphereMaterial)
      miniSphere.position.set(radius*Math.sin(i*2*Math.PI/n), radius*Math.cos(i*2*Math.PI/n))
      miniSphere.name = this.neurofeedbackDimensions[i]
      this.neurofeedbackGroup.add(miniSphere)
    }
    this.neurofeedbackGroup.position.set(this.x,this.y,this.z)
    this.active = true;
  }

  mercX(lon=this.longitude) { 
    return (lon+180)*(this.meshWidth/360) - this.meshWidth/2
  }
  
  mercY(lat=this.latitude) {
    return -((this.meshHeight/180.0) * (90 - lat)) + this.meshHeight/2;
  }

  animateNeurofeedback(){

  }

}