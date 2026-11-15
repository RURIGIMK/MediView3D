import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupLighting(renderer, scene) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmremGenerator.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmremGenerator.dispose();

  scene.add(new THREE.HemisphereLight(0xcbd8e6, 0x282b35, 1.05));
  const keyLight = new THREE.DirectionalLight(0xf5f2e9, 2.6);
  keyLight.position.set(-2.5, 4, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x9bb8d1, 0.75);
  fillLight.position.set(2, 1.2, -3);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0x8c9cd5, 0.35, 8);
  rimLight.position.set(0, -0.2, -2.3);
  scene.add(rimLight);
}
