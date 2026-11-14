import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#viewer');
const loadState = $('#load-state');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d14);
scene.fog = new THREE.Fog(0x080d14, 10, 22);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
} catch (error) {
  loadState.innerHTML = '<span class="error">WebGL is unavailable in this browser.</span>';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, 0.05, 3.65);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 1.8;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.95;
controls.screenSpacePanning = true;
controls.update();

scene.add(new THREE.HemisphereLight(0xcbd8e6, 0x282b35, 2.0));
const keyLight = new THREE.DirectionalLight(0xf5f6ff, 3.0);
keyLight.position.set(-2.5, 4, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x87b8d1, 1.3);
fillLight.position.set(2, 1.2, -3);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0x43bea9, 0.75, 8);
rimLight.position.set(0, -0.2, -2.3);
scene.add(rimLight);

const anatomyRoot = new THREE.Group();
scene.add(anatomyRoot);
const categoryDefinitions = [
  { id: 'skeleton', label: 'Skeleton', color: '#cbd5df' },
  { id: 'cardiovascular', label: 'Cardiovascular', color: '#e96773' },
  { id: 'respiratory', label: 'Respiratory', color: '#cf7a82' },
  { id: 'digestive', label: 'Digestive', color: '#dc9454' },
  { id: 'urinary', label: 'Urinary', color: '#bd78be' },
];
const categoryById = Object.fromEntries(categoryDefinitions.map((category) => [category.id, category]));
const structureMeta = {
  'Human skeleton': { category: 'skeleton', location: 'Full body; axial and appendicular skeleton.', function: 'Supports the body, protects internal organs, and provides attachment points for movement.', description: 'This scan based mesh is the supplied Blender scene exported for browser rendering. The source scene contains one joined skeleton mesh, so individual bones are not separately selectable in this scan.' },
  Heart: { category: 'cardiovascular', location: 'Thoracic cavity, between the lungs.', function: 'Moves blood through the pulmonary and systemic circulations.', description: 'The supplied model includes a single heart mesh. The model is an educational visualization and is not a patient specific segmentation.' },
  Lung_L: { category: 'respiratory', location: 'Left side of the thoracic cavity.', function: 'Exchanges oxygen and carbon dioxide between air and blood.', description: 'This is the left lung structure present in the supplied model.' },
  Lung_R: { category: 'respiratory', location: 'Right side of the thoracic cavity.', function: 'Exchanges oxygen and carbon dioxide between air and blood.', description: 'This is the right lung structure present in the supplied model.' },
  Liver: { category: 'digestive', location: 'Upper abdomen, predominantly on the right.', function: 'Processes absorbed nutrients and produces bile, among other metabolic roles.', description: 'The supplied model includes one liver mesh. Its shape is an anatomical visualization, not a clinical segmentation.' },
  Stomach: { category: 'digestive', location: 'Upper abdomen, below the diaphragm.', function: 'Stores food and begins mechanical and chemical digestion.', description: 'This is the stomach structure present in the supplied model.' },
  Kidney_L: { category: 'urinary', location: 'Posterior upper abdomen on the left.', function: 'Filters blood and contributes to fluid, electrolyte, and acid-base regulation.', description: 'This is the left kidney structure present in the supplied model.' },
  Kidney_R: { category: 'urinary', location: 'Posterior upper abdomen on the right.', function: 'Filters blood and contributes to fluid, electrolyte, and acid-base regulation.', description: 'This is the right kidney structure present in the supplied model.' },
  Bladder: { category: 'urinary', location: 'Pelvis, behind the pubic symphysis.', function: 'Stores urine before it is released from the body.', description: 'This is the bladder structure present in the supplied model.' },
  Aorta_Central: { category: 'cardiovascular', location: 'Central thorax and abdomen.', function: 'Carries oxygenated blood from the heart to the systemic circulation.', description: 'Aorta segment included in the supplied anatomy export.' },
  VenaCava_Central: { category: 'cardiovascular', location: 'Central thorax and abdomen.', function: 'Returns systemic venous blood toward the heart.', description: 'Central vena cava segment included in the supplied anatomy export.' },
  Carotid_L: { category: 'cardiovascular', location: 'Left side of the neck.', function: 'Supplies arterial blood toward the head and neck.', description: 'Left carotid pathway included in the supplied anatomy export.' },
  Carotid_R: { category: 'cardiovascular', location: 'Right side of the neck.', function: 'Supplies arterial blood toward the head and neck.', description: 'Right carotid pathway included in the supplied anatomy export.' },
  Artery_Arm_L: { category: 'cardiovascular', location: 'Left upper limb.', function: 'Represents an arterial pathway supplying the left upper limb.', description: 'This is a simplified arm artery pathway in the supplied model.' },
  Vein_Arm_L: { category: 'cardiovascular', location: 'Left upper limb.', function: 'Represents a venous pathway returning blood from the left upper limb.', description: 'This is a simplified arm vein pathway in the supplied model.' },
  Artery_Arm_R: { category: 'cardiovascular', location: 'Right upper limb.', function: 'Represents an arterial pathway supplying the right upper limb.', description: 'This is a simplified arm artery pathway in the supplied model.' },
  Vein_Arm_R: { category: 'cardiovascular', location: 'Right upper limb.', function: 'Represents a venous pathway returning blood from the right upper limb.', description: 'This is a simplified arm vein pathway in the supplied model.' },
  Artery_Leg_L: { category: 'cardiovascular', location: 'Left lower limb.', function: 'Represents an arterial pathway supplying the left lower limb.', description: 'This is a simplified leg artery pathway in the supplied model.' },
  Vein_Leg_L: { category: 'cardiovascular', location: 'Left lower limb.', function: 'Represents a venous pathway returning blood from the left lower limb.', description: 'This is a simplified leg vein pathway in the supplied model.' },
  Artery_Leg_R: { category: 'cardiovascular', location: 'Right lower limb.', function: 'Represents an arterial pathway supplying the right lower limb.', description: 'This is a simplified leg artery pathway in the supplied model.' },
  Vein_Leg_R: { category: 'cardiovascular', location: 'Right lower limb.', function: 'Represents a venous pathway returning blood from the right lower limb.', description: 'This is a simplified leg vein pathway in the supplied model.' },
};
const displayNames = {
  'Human skeleton': 'Full skeleton scan', Lung_L: 'Left lung', Lung_R: 'Right lung',
  Kidney_L: 'Left kidney', Kidney_R: 'Right kidney', Aorta_Central: 'Aorta',
  VenaCava_Central: 'Vena cava', Carotid_L: 'Left carotid artery', Carotid_R: 'Right carotid artery',
  Artery_Arm_L: 'Left arm artery', Artery_Arm_R: 'Right arm artery',
  Vein_Arm_L: 'Left arm vein', Vein_Arm_R: 'Right arm vein',
  Artery_Leg_L: 'Left leg artery', Artery_Leg_R: 'Right leg artery',
  Vein_Leg_L: 'Left leg vein', Vein_Leg_R: 'Right leg vein',
};
const systems = new Map(categoryDefinitions.map((category) => [category.id, { ...category, visible: true, group: new THREE.Group(), structures: [] }]));
for (const system of systems.values()) {
  system.group.name = system.label;
  if (system.id !== 'skeleton') system.group.position.y = -0.83;
  anatomyRoot.add(system.group);
}

const grid = new THREE.GridHelper(3.2, 16, 0x40566b, 0x293b4c);
grid.position.y = -0.86;
grid.material.transparent = true;
grid.material.opacity = 0.58;
scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShadowMaterial({ opacity: 0.15 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.865;
ground.receiveShadow = true;
scene.add(ground);

const structures = new Map();
let selectedRecord = null;
let activeCategoryFilter = null;
let labelsEnabled = true;
let measureMode = false;
let measurePoints = [];
let measureObjects = [];
let isolatedKey = null;
let tourIndex = -1;
let toastTimer = 0;
const annotation = $('#annotation');
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.018;
const pointer = new THREE.Vector2();

function friendlyName(name) {
  if (displayNames[name]) return displayNames[name];
  if (name === 'Human skeleton') return 'Full skeleton scan';
  const side = name.endsWith('_L') ? ' (Left)' : name.endsWith('_R') ? ' (Right)' : '';
  return name.replace(/_(L|R)$/, '').replaceAll('_', ' ') + side;
}
function metadataFor(name) {
  if (structureMeta[name]) return structureMeta[name];
  const match = name.match(/^(Artery|Vein)_(Arm|Leg)_([LR])$/);
  if (match) {
    const system = 'cardiovascular';
    const [_, vessel, region, side] = match;
    const limb = region === 'Arm' ? 'upper' : 'lower';
    const laterality = side === 'L' ? 'left' : 'right';
    return { category: system, location: `${laterality[0].toUpperCase()}${laterality.slice(1)} ${limb} limb.`, function: `Represents a ${vessel.toLowerCase()} pathway in the ${laterality} ${limb} limb.`, description: 'A simplified pathway included in the supplied anatomy model.' };
  }
  return null;
}
function recordFromObject(name, object, category, root = object) {
  if (!name || structures.has(name) || !metadataFor(name)) return structures.get(name);
  const metadata = metadataFor(name);
  const system = systems.get(category || metadata.category);
  if (!system) return null;
  const record = { key: name, name, displayName: friendlyName(name), system, root, meshes: [], visible: true, initialMaterials: new Map(), bounds: new THREE.Box3() };
  root.userData.structureKey = name;
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
    child.userData.structureKey = name;
    child.castShadow = true;
    child.receiveShadow = true;
    record.meshes.push(child);
    record.initialMaterials.set(child, child.material);
  });
  structures.set(name, record);
  system.structures.push(record);
  system.group.add(root);
  root.updateMatrixWorld(true);
  record.bounds.setFromObject(root);
  return record;
}

function setLoadText(message, error = false) {
  loadState.classList.toggle('error', error);
  loadState.innerHTML = error ? `<span>${message}</span>` : `<span class="spinner"></span><span>${message}</span>`;
}
function installSkeleton(gltf) {
  const root = gltf.scene;
  root.name = 'Human skeleton';
  root.userData.structureKey = 'Human skeleton';
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.structureKey = 'Human skeleton';
  });
  recordFromObject('Human skeleton', root, 'skeleton', root);
  fitCameraToModel(root);
  buildSystemControls();
  buildStructureBrowser();
  updateStructureCount();
  setLoadText('Loading named anatomical structures…');
}
function loadSkeleton() {
  return new Promise((resolve, reject) => {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load('/assets/anatomy/skeleton_scan.glb', (gltf) => {
      draco.dispose();
      installSkeleton(gltf);
      resolve();
    }, (event) => {
      if (event.total) setLoadText(`Loading scan mesh · ${Math.round(event.loaded / event.total * 100)}%`);
    }, (error) => { draco.dispose(); reject(error); });
  });
}
const includedObjStructures = /^(Heart|Lung_[LR]|Liver|Stomach|Kidney_[LR]|Bladder|Aorta_Central|VenaCava_Central|Carotid_[LR]|Artery_(Arm|Leg)_[LR]|Vein_(Arm|Leg)_[LR])$/;
function loadNamedAnatomy() {
  return new Promise((resolve, reject) => {
    const materialLoader = new MTLLoader();
    materialLoader.setPath('/assets/anatomy/');
    materialLoader.load('mediview_anatomy.mtl', (materials) => {
      materials.preload();
      const loader = new OBJLoader();
      loader.setMaterials(materials);
      loader.load('/assets/anatomy/mediview_anatomy.obj', (root) => {
        for (const object of root.children) {
          if (!includedObjStructures.test(object.name)) continue;
          const meta = metadataFor(object.name);
          if (meta) recordFromObject(object.name, object, meta.category);
        }
        buildSystemControls();
        buildStructureBrowser();
        updateStructureCount();
        resolve();
      }, undefined, reject);
    }, undefined, reject);
  });
}

function updateStructureCount() {
  const availableSystems = [...systems.values()].filter((system) => system.structures.length > 0);
  const count = structures.size;
  $('#structure-count').textContent = String(count).padStart(2, '0');
  $('#visible-count').textContent = `${availableSystems.length} systems`;
}
function buildSystemControls() {
  const container = $('#system-list');
  const current = new Map([...container.querySelectorAll('[data-system]')].map((button) => [button.dataset.system, button.getAttribute('aria-pressed') !== 'false']));
  container.replaceChildren();
  for (const system of systems.values()) {
    if (!system.structures.length) continue;
    if (current.has(system.id)) system.visible = current.get(system.id);
    const button = document.createElement('button');
    button.className = 'system-chip-button';
    button.dataset.system = system.id;
    button.style.setProperty('--system-color', system.color);
    button.setAttribute('aria-pressed', String(system.visible));
    button.title = `${system.visible ? 'Hide' : 'Show'} ${system.label}; double-click to filter, right-click to isolate`;
    button.innerHTML = `<i class="system-indicator" aria-hidden="true"></i><span>${system.label}</span>`;
    button.addEventListener('click', () => {
      system.visible = !system.visible;
      button.setAttribute('aria-pressed', String(system.visible));
      applyVisibility();
      buildStructureBrowser();
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      for (const other of systems.values()) other.visible = other.id === system.id;
      buildSystemControls(); applyVisibility(); buildStructureBrowser();
    });
    container.append(button);
  }
}
function buildStructureBrowser() {
  const container = $('#structure-list');
  const query = $('#structure-search').value.trim().toLowerCase();
  const entries = [...structures.values()].filter((record) => {
    const matchesQuery = !query || record.displayName.toLowerCase().includes(query) || record.name.toLowerCase().includes(query) || record.system.label.toLowerCase().includes(query);
    const matchesCategory = !activeCategoryFilter || record.system.id === activeCategoryFilter;
    return matchesQuery && matchesCategory;
  }).sort((a, b) => a.system.label.localeCompare(b.system.label) || a.displayName.localeCompare(b.displayName));
  container.replaceChildren();
  let lastSystem = null;
  let group;
  for (const record of entries) {
    if (record.system.id !== lastSystem) {
      group = document.createElement('div'); group.className = 'structure-group';
      const heading = document.createElement('div'); heading.className = 'structure-group-title'; heading.textContent = record.system.label; group.append(heading); container.append(group); lastSystem = record.system.id;
    }
    const row = document.createElement('button');
    row.className = `structure-item${record === selectedRecord ? ' active' : ''}${record.system.visible && record.visible ? '' : ' hidden-structure'}`;
    row.style.setProperty('--system-color', record.system.color);
    row.innerHTML = `<i class="structure-dot"></i><span>${record.displayName}</span><span class="eye">${record.visible ? '◉' : '○'}</span>`;
    row.title = `${record.displayName} · ${record.system.label}`;
    row.addEventListener('click', () => selectStructure(record));
    row.querySelector('.eye').addEventListener('click', (event) => {
      event.stopPropagation(); record.visible = !record.visible; applyVisibility(); buildStructureBrowser();
    });
    group.append(row);
  }
  $('#visible-count').textContent = `${entries.length} shown`;
}
function applyVisibility() {
  for (const system of systems.values()) {
    system.group.visible = system.visible;
    for (const record of system.structures) record.root.visible = record.visible;
  }
  if (isolatedKey) applyIsolation();
  updateAnnotation();
}
function isAnatomyVisible(object) {
  for (let current = object; current && current !== anatomyRoot; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}
function updateStructureInfo(record) {
  selectedRecord = record;
  $('#empty-info').hidden = Boolean(record);
  $('#structure-info').hidden = !record;
  $('#clear-selection').hidden = !record;
  if (!record) { annotation.hidden = true; return; }
  const metadata = metadataFor(record.name);
  if (!metadata) return;
  $('#info-system').textContent = record.system.label;
  $('#info-system').style.setProperty('--system-color', record.system.color);
  $('#info-name').textContent = record.displayName;
  $('#info-location').textContent = metadata.location;
  $('#info-function').textContent = metadata.function;
  $('#info-description').textContent = metadata.description;
  $('#opacity-slider').value = '100'; $('#opacity-value').textContent = '100%';
  buildStructureBrowser();
  updateAnnotation();
}
function selectStructure(record, { focus = true } = {}) {
  if (!record) return;
  if (!record.visible) { record.visible = true; record.system.visible = true; buildSystemControls(); applyVisibility(); }
  clearHighlight();
  selectedRecord = record;
  setHighlight(record, true);
  if (isolatedKey) { isolatedKey = record.key; applyIsolation(); }
  updateStructureInfo(record);
  if (focus) focusRecord(record);
}
function setHighlight(record, enabled) {
  for (const mesh of record.meshes) {
    if (enabled) {
      const originals = Array.isArray(record.initialMaterials.get(mesh)) ? record.initialMaterials.get(mesh) : [record.initialMaterials.get(mesh)];
      const highlighted = originals.map((material) => {
        const copy = material.clone();
        if ('emissive' in copy) { copy.emissive.set(0x16a987); copy.emissiveIntensity = 0.32; }
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? highlighted : highlighted[0];
    } else {
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      current.forEach((material) => material?.dispose?.());
      mesh.material = record.initialMaterials.get(mesh);
    }
  }
}
function clearHighlight() { if (selectedRecord) setHighlight(selectedRecord, false); }
function focusRecord(record) {
  const bounds = record.bounds;
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.62, 0.15);
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const distance = THREE.MathUtils.clamp(radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)), controls.minDistance, controls.maxDistance);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction.lengthSq() ? direction : new THREE.Vector3(0, 0, 1), distance);
  controls.update();
}
function fitCameraToModel(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.set(center.x, center.y + 0.04, center.z + Math.max(3.5, size.y * 2.18));
  controls.minDistance = Math.max(0.45, size.y * 0.88);
  controls.maxDistance = Math.max(7, size.y * 7.5);
  controls.update();
}
function applyIsolation() {
  for (const system of systems.values()) {
    for (const record of system.structures) {
      record.root.visible = record.system.visible && record.visible;
      for (const mesh of record.meshes) {
        const materials = record.initialMaterials.get(mesh);
        const list = Array.isArray(materials) ? materials : [materials];
        const fade = record.key !== isolatedKey;
        if (fade) {
          const faded = list.map((material) => {
            const copy = material.clone(); copy.transparent = true; copy.opacity = Math.min(material.opacity ?? 1, 0.12); copy.depthWrite = false; return copy;
          });
          const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          current.forEach((material) => { if (material !== materials) material?.dispose?.(); });
          mesh.material = Array.isArray(materials) ? faded : faded[0];
        } else if (mesh.material !== materials) {
          const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          current.forEach((material) => material?.dispose?.());
          mesh.material = materials;
        }
      }
    }
  }
  $('#isolate-state').hidden = !isolatedKey;
  $('#isolate').textContent = isolatedKey ? '◉  Exit isolation' : '◉  Isolate structure';
}
function setIsolation(key) {
  isolatedKey = isolatedKey ? null : key;
  applyIsolation();
}
function updateAnnotation() {
  if (!labelsEnabled || !selectedRecord || !isAnatomyVisible(selectedRecord.root)) { annotation.hidden = true; return; }
  const bounds = selectedRecord.bounds;
  if (bounds.isEmpty()) { annotation.hidden = true; return; }
  const point = bounds.getCenter(new THREE.Vector3()).project(camera);
  if (point.z < -1 || point.z > 1) { annotation.hidden = true; return; }
  const x = (point.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-point.y * 0.5 + 0.5) * window.innerHeight;
  annotation.textContent = selectedRecord.displayName;
  annotation.style.left = `${x + 12}px`;
  annotation.style.top = `${y - 12}px`;
  annotation.hidden = false;
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2100);
}

function pickAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(anatomyRoot.children, true).find((hit) => isAnatomyVisible(hit.object) && hit.object.userData.structureKey);
}
let pointerDown = null;
canvas.addEventListener('pointerdown', (event) => { if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  const wasClick = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 4;
  pointerDown = null;
  if (!wasClick) return;
  const hit = pickAt(event);
  if (measureMode) { if (hit) addMeasurePoint(hit.point); return; }
  if (hit) {
    const record = structures.get(hit.object.userData.structureKey);
    if (record) selectStructure(record, { focus: false });
  }
});
$('#structure-search').addEventListener('input', buildStructureBrowser);
$('#structure-search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const first = $('#structure-list .structure-item');
    if (first) first.click();
  }
});
$('#clear-selection').addEventListener('click', () => { clearHighlight(); selectedRecord = null; updateStructureInfo(null); buildStructureBrowser(); });
$('#reset-layers').addEventListener('click', () => {
  for (const system of systems.values()) { system.visible = true; for (const record of system.structures) record.visible = true; }
  if (isolatedKey) { isolatedKey = null; applyIsolation(); }
  applyVisibility(); buildSystemControls(); buildStructureBrowser();
  $('#isolate-state').hidden = true; showToast('All available anatomy layers are visible');
});
$('#isolate').addEventListener('click', () => { if (!selectedRecord) return; setIsolation(selectedRecord.key); });
$('#show-all').addEventListener('click', () => { isolatedKey = null; applyVisibility(); });
$('#opacity-slider').addEventListener('input', (event) => {
  if (!selectedRecord) return;
  const opacity = Number(event.target.value) / 100;
  $('#opacity-value').textContent = `${event.target.value}%`;
  for (const mesh of selectedRecord.meshes) {
    const source = selectedRecord.initialMaterials.get(mesh);
    const materials = Array.isArray(source) ? source : [source];
    const copies = materials.map((material) => {
      const copy = material.clone(); copy.transparent = opacity < 1 || material.transparent; copy.opacity = opacity; copy.depthWrite = opacity > 0.98; return copy;
    });
    mesh.material = Array.isArray(source) ? copies : copies[0];
  }
});

const viewDirections = {
  front: { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), label: 'ANTERIOR' },
  back: { direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), label: 'POSTERIOR' },
  left: { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: 'LEFT LATERAL' },
  right: { direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: 'RIGHT LATERAL' },
  top: { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), label: 'SUPERIOR' },
  bottom: { direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1), label: 'INFERIOR' },
};
function setView(name) {
  const view = viewDirections[name]; if (!view) return;
  const distance = camera.position.distanceTo(controls.target);
  camera.up.copy(view.up);
  camera.position.copy(controls.target).addScaledVector(view.direction, distance);
  controls.update();
  $('.model-name').textContent = `FULL BODY · ${view.label}`;
  document.querySelectorAll('.view-button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}
document.querySelectorAll('.view-button').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$('#reset-camera').addEventListener('click', () => { const scan = structures.get('Human skeleton'); if (scan) fitCameraToModel(scan.root); setView('front'); });
$('#labels').addEventListener('click', () => {
  labelsEnabled = !labelsEnabled; $('#labels').classList.toggle('selected', labelsEnabled); updateAnnotation();
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === '/') { event.preventDefault(); $('#structure-search').focus(); }
  if (event.key.toLowerCase() === 'r') $('#reset-camera').click();
  if (event.key === '1') setView('front');
  if (event.key === '2') setView('back');
  if (event.key === '3') setView('left');
  if (event.key === '4') setView('right');
});

function addMeasurePoint(point) {
  measurePoints.push(point.clone());
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), new THREE.MeshBasicMaterial({ color: 0x55e0bd }));
  marker.position.copy(point); scene.add(marker); measureObjects.push(marker);
  if (measurePoints.length === 2) {
    const [a, b] = measurePoints;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x55e0bd }));
    scene.add(line); measureObjects.push(line);
    const cm = a.distanceTo(b) * 100;
    $('#measure-hint').firstChild.textContent = `Measured distance: ${cm.toFixed(1)} cm `;
    $('#measure').classList.add('selected'); measureMode = false;
    setTimeout(() => $('#measure-hint').hidden = true, 3000);
  }
}
function clearMeasure() {
  measureMode = false; measurePoints = [];
  for (const object of measureObjects) { scene.remove(object); object.geometry?.dispose?.(); object.material?.dispose?.(); }
  measureObjects = []; $('#measure-hint').hidden = true; $('#measure').classList.remove('selected');
}
$('#measure').addEventListener('click', () => {
  clearMeasure(); measureMode = true; $('#measure-hint').hidden = false;
  $('#measure-hint').firstChild.textContent = 'Click two points on the model to measure ';
  $('#measure').classList.add('selected');
});
$('#cancel-measure').addEventListener('click', clearMeasure);

function saveScreenshot() {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) { showToast('Screenshot could not be created'); return; }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'mediview-anatomy.png'; link.click(); URL.revokeObjectURL(link.href);
    showToast('Screenshot saved');
  }, 'image/png');
}
$('#screenshot').addEventListener('click', saveScreenshot);
function saveView() {
  const state = {
    camera: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(),
    systems: Object.fromEntries([...systems].map(([id, system]) => [id, system.visible])),
    structures: Object.fromEntries([...structures].map(([key, record]) => [key, record.visible])),
  };
  localStorage.setItem('mediview-anatomy-view', JSON.stringify(state));
  showToast('View saved on this device');
}
$('#save-view').addEventListener('click', saveView);
function restoreView() {
  try {
    const state = JSON.parse(localStorage.getItem('mediview-anatomy-view') || 'null');
    if (!state) return;
    camera.position.fromArray(state.camera); controls.target.fromArray(state.target); camera.up.fromArray(state.up);
    for (const [id, visible] of Object.entries(state.systems || {})) if (systems.has(id)) systems.get(id).visible = visible;
    for (const [key, visible] of Object.entries(state.structures || {})) if (structures.has(key)) structures.get(key).visible = visible;
    controls.update(); buildSystemControls(); applyVisibility(); buildStructureBrowser(); showToast('Saved view restored');
  } catch { showToast('Saved view could not be restored'); }
}
$('#restore-view').addEventListener('click', restoreView);

const guidedKeys = ['Heart','Lung_L','Liver','Kidney_L','Bladder','VenaCava_Central','Human skeleton'];
const tourCard = $('#tour-card');
function showTourStop() {
  const key = guidedKeys[tourIndex]; const record = structures.get(key);
  if (!record) { if (tourIndex < guidedKeys.length - 1) { tourIndex++; showTourStop(); } else finishTour(); return; }
  selectStructure(record);
  $('#tour-title').textContent = record.displayName;
  $('#tour-progress').textContent = `Structure ${tourIndex + 1} of ${guidedKeys.length} · ${record.system.label}`;
  tourCard.hidden = false;
  $('#tour-next').textContent = tourIndex === guidedKeys.length - 1 ? 'Finish' : 'Next →';
}
function finishTour() { tourCard.hidden = true; tourIndex = -1; clearHighlight(); showToast('Guided exploration complete'); }
$('#guided-tour').addEventListener('click', () => { tourIndex = 0; showTourStop(); });
$('#tour-next').addEventListener('click', () => { if (tourIndex >= guidedKeys.length - 1) finishTour(); else { tourIndex++; showTourStop(); } });
$('#tour-close').addEventListener('click', finishTour);

$('#structure-search').addEventListener('focus', () => { activeCategoryFilter = null; buildStructureBrowser(); });
let savedCategoryFilter = null;
$('#system-list').addEventListener('dblclick', (event) => {
  const button = event.target.closest('[data-system]'); if (!button) return;
  savedCategoryFilter = savedCategoryFilter === button.dataset.system ? null : button.dataset.system;
  activeCategoryFilter = savedCategoryFilter; buildStructureBrowser();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
controls.addEventListener('change', updateAnnotation);

setLoadText('Loading high detail scan mesh…');
Promise.all([loadSkeleton(), loadNamedAnatomy()]).then(() => {
  setLoadText(`${structures.size} structures · Artec Group scan · CC BY 3.0`);
  updateStructureCount(); buildSystemControls(); buildStructureBrowser();
  $('#restore-view').disabled = !localStorage.getItem('mediview-anatomy-view');
}).catch((error) => {
  console.error('Anatomy model load failed', error);
  setLoadText('Some anatomy assets could not be loaded. Check your connection and refresh.', true);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  updateAnnotation();
}
animate();
