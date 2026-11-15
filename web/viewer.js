import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildVesselStructures, vesselStructureNames } from './vessels.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#viewer');
const loadState = $('#load-state');
const scene = new THREE.Scene();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
} catch (error) {
  loadState.innerHTML = '<span class="error">WebGL is unavailable in this browser.</span>';
  throw error;
}
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
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

scene.add(new THREE.HemisphereLight(0xcbd8e6, 0x282b35, 1.35));
const keyLight = new THREE.DirectionalLight(0xf5f6ff, 3.0);
keyLight.position.set(-2.5, 4, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x87b8d1, 0.9);
fillLight.position.set(2, 1.2, -3);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0x43bea9, 0.45, 8);
rimLight.position.set(0, -0.2, -2.3);
scene.add(rimLight);

const anatomyRoot = new THREE.Group();
scene.add(anatomyRoot);
const namedAnatomyRoot = new THREE.Group();
namedAnatomyRoot.name = 'Registered anatomy layers';
anatomyRoot.add(namedAnatomyRoot);
const anatomyLabelDefinitions = {
  Lung_R: { text: 'RIGHT LUNG', x: -58, y: -9, align: 'right' },
  Lung_L: { text: 'LEFT LUNG', x: 58, y: -9, align: 'left' },
  Heart: { text: 'HEART', x: 58, y: 32, align: 'left' },
  Liver: { text: 'LIVER', x: -58, y: -7, align: 'right' },
  Stomach: { text: 'STOMACH', x: 58, y: -7, align: 'left' },
  Kidney_R: { text: 'RIGHT KIDNEY', x: -56, y: 0, align: 'right' },
  Kidney_L: { text: 'LEFT KIDNEY', x: 56, y: 0, align: 'left' },
  Bladder: { text: 'BLADDER', x: 0, y: 25, align: 'center' },
};
const organStructureNames = new Set(['Heart', 'Lung_L', 'Lung_R', 'Liver', 'Stomach', 'Kidney_L', 'Kidney_R', 'Bladder']);
const layerDefinitions = [
  { id: 'skeleton', label: 'Skeleton', color: '#cbd5df', visible: true, matches: (record) => record.name === 'Human skeleton' },
  { id: 'organs', label: 'Organs', color: '#cf7a82', visible: true, matches: (record) => organStructureNames.has(record.name) },
  { id: 'vessels', label: 'Vessels', color: '#e96773', visible: true, matches: (record) => vesselStructureNames.has(record.name) },
  { id: 'muscles', label: 'Muscles', color: '#7d8b98', available: false },
  { id: 'nerves', label: 'Nerves', color: '#7d8b98', available: false },
];
const anatomyLabelNodes = new Map();
const anatomyLeaderLines = new Map();
const anatomyLabelMeshes = [];
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
  Aorta_Central: { category: 'cardiovascular', location: 'Central thorax and abdomen.', function: 'Carries oxygenated blood from the heart to the systemic circulation.', description: 'A landmark-driven educational path through the thorax and abdomen.' },
  VenaCava_Central: { category: 'cardiovascular', location: 'Central thorax and abdomen.', function: 'Returns systemic venous blood toward the heart.', description: 'A landmark-driven educational return path through the abdomen and thorax.' },
  Carotid_L: { category: 'cardiovascular', location: 'Left side of the neck.', function: 'Supplies arterial blood toward the head and neck.', description: 'A simplified carotid path generated from the skeleton landmarks.' },
  Carotid_R: { category: 'cardiovascular', location: 'Right side of the neck.', function: 'Supplies arterial blood toward the head and neck.', description: 'A simplified carotid path generated from the skeleton landmarks.' },
  Artery_Arm_L: { category: 'cardiovascular', location: 'Left upper limb.', function: 'Represents an arterial pathway supplying the left upper limb.', description: 'A simplified, tapered arm artery path generated from the skeleton landmarks.' },
  Vein_Arm_L: { category: 'cardiovascular', location: 'Left upper limb.', function: 'Represents a venous pathway returning blood from the left upper limb.', description: 'A simplified, tapered arm vein path returning toward the vena cava.' },
  Artery_Arm_R: { category: 'cardiovascular', location: 'Right upper limb.', function: 'Represents an arterial pathway supplying the right upper limb.', description: 'A simplified, tapered arm artery path generated from the skeleton landmarks.' },
  Vein_Arm_R: { category: 'cardiovascular', location: 'Right upper limb.', function: 'Represents a venous pathway returning blood from the right upper limb.', description: 'A simplified, tapered arm vein path returning toward the vena cava.' },
  Artery_Leg_L: { category: 'cardiovascular', location: 'Left lower limb.', function: 'Represents an arterial pathway supplying the left lower limb.', description: 'A simplified, tapered leg artery path generated from the skeleton landmarks.' },
  Vein_Leg_L: { category: 'cardiovascular', location: 'Left lower limb.', function: 'Represents a venous pathway returning blood from the left lower limb.', description: 'A simplified, tapered leg vein path returning toward the vena cava.' },
  Artery_Leg_R: { category: 'cardiovascular', location: 'Right lower limb.', function: 'Represents an arterial pathway supplying the right lower limb.', description: 'A simplified, tapered leg artery path generated from the skeleton landmarks.' },
  Vein_Leg_R: { category: 'cardiovascular', location: 'Right lower limb.', function: 'Represents a venous pathway returning blood from the right lower limb.', description: 'A simplified, tapered leg vein path returning toward the vena cava.' },
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
  (system.id === 'skeleton' ? anatomyRoot : namedAnatomyRoot).add(system.group);
}

const grid = new THREE.GridHelper(3.2, 16, 0x40566b, 0x293b4c);
grid.position.y = -0.86;
grid.material.transparent = true;
grid.material.opacity = 0.075;
scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShadowMaterial({ opacity: 0.15 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.865;
ground.receiveShadow = true;
scene.add(ground);

const structures = new Map();
let selectedRecord = null;
let hoveredRecord = null;
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
const annotationProjectionPoint = new THREE.Vector3();
const anatomyLabelProjectionPoint = new THREE.Vector3();

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
function createBoneMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe4d8c2,
    roughness: 0.56,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.72,
    specularIntensity: 0.18,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <opaque_fragment>', `
        float boneXray = clamp(1.0 - diffuseColor.a, 0.0, 1.0);
        float boneFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
        float boneFresnel = pow(1.0 - clamp(boneFacing, 0.0, 1.0), 2.4);
        float boneCavity = clamp((length(dFdx(normal)) + length(dFdy(normal))) * 0.035, 0.0, 0.2);
        outgoingLight *= 1.0 - boneCavity * (1.0 - boneXray);
        outgoingLight = mix(outgoingLight, vec3(0.44, 0.74, 1.0), boneFresnel * boneXray * 0.95);
        diffuseColor.a = mix(diffuseColor.a, 0.10 + boneFresnel * 0.62, boneXray);
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'mediview-bone-xray-v1';
  return material;
}
function installSkeleton(gltf) {
  const root = gltf.scene;
  root.name = 'Human skeleton';
  root.userData.structureKey = 'Human skeleton';
  const boneMaterial = createBoneMaterial();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material.dispose();
    object.material = boneMaterial;
    object.castShadow = true;
    object.receiveShadow = true;
    object.renderOrder = 1;
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
function loadNamedAnatomy() {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    const loadObj = new Promise((loadResolve, loadReject) => {
      loader.load('/assets/anatomy/mediview_anatomy.obj', loadResolve, undefined, loadReject);
    });
    const loadOrgans = new Promise((loadResolve, loadReject) => {
      new GLTFLoader().load('/assets/anatomy/organs.glb', loadResolve, undefined, loadReject);
    });
    Promise.all([loadObj, loadOrgans]).then(([root, organs]) => {
      root.updateMatrixWorld(true);
      const sourceBounds = new THREE.Box3().setFromObject(root);
      const scanBounds = structures.get('Human skeleton')?.bounds;
      if (!scanBounds || sourceBounds.isEmpty() || scanBounds.isEmpty()) {
        throw new Error('Unable to register anatomy landmarks to the skeleton scan.');
      }
      const sourceSize = sourceBounds.getSize(new THREE.Vector3());
      const scanSize = scanBounds.getSize(new THREE.Vector3());
      const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
      const scanCenter = scanBounds.getCenter(new THREE.Vector3());
      const registrationScale = scanSize.y / sourceSize.y;
      namedAnatomyRoot.scale.setScalar(registrationScale);
      namedAnatomyRoot.position.copy(scanCenter).addScaledVector(sourceCenter, -registrationScale);
      namedAnatomyRoot.updateMatrixWorld(true);
      for (const object of [...organs.scene.children]) {
        if (!organStructureNames.has(object.name)) continue;
        const meta = metadataFor(object.name);
        if (!meta) continue;
        recordFromObject(object.name, object, meta.category);
      }
      buildVesselStructures({
        sourceRoot: root,
        skeletonRoot: structures.get('Human skeleton')?.root,
        registrationRoot: namedAnatomyRoot,
        structures,
        register: (name, vesselRoot) => recordFromObject(name, vesselRoot, 'cardiovascular'),
      });
      buildSystemControls();
      buildStructureBrowser();
      updateStructureCount();
      buildAnatomyLabels();
      resolve();
    }).catch(reject);
  });
}

function updateStructureCount() {
  const availableSystems = [...systems.values()].filter((system) => system.structures.length > 0);
  const count = structures.size;
  $('#structure-count').textContent = String(count).padStart(2, '0');
  $('#visible-count').textContent = `${availableSystems.length} systems`;
}
function layerForRecord(record) {
  return layerDefinitions.find((layer) => layer.matches?.(record));
}
function isRecordVisible(record) {
  const layer = layerForRecord(record);
  return record.visible && record.system.visible && (layer?.visible ?? true);
}
function buildLayerControls() {
  const container = $('#layer-list');
  container.replaceChildren();
  for (const layer of layerDefinitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `layer-button${layer.available === false ? ' coming-soon' : ''}`;
    button.dataset.layer = layer.id;
    button.style.setProperty('--layer-color', layer.color);
    if (layer.available === false) {
      button.disabled = true;
      button.setAttribute('aria-label', `${layer.label}, coming soon`);
      button.title = `${layer.label} models are coming soon`;
      button.innerHTML = `<i class="layer-indicator" aria-hidden="true"></i><span class="layer-copy"><span>${layer.label}</span><small>Coming soon</small></span>`;
    } else {
      button.setAttribute('aria-pressed', String(layer.visible));
      button.title = `${layer.visible ? 'Hide' : 'Show'} ${layer.label}`;
      button.innerHTML = `<i class="layer-indicator" aria-hidden="true"></i><span class="layer-copy"><span>${layer.label}</span><small>${layer.visible ? 'Shown' : 'Hidden'}</small></span>`;
      button.addEventListener('click', () => {
        layer.visible = !layer.visible;
        applyVisibility();
        buildLayerControls();
        buildStructureBrowser();
      });
    }
    container.append(button);
  }
}
function buildSystemControls() {
  const container = $('#system-list');
  container.replaceChildren();
  for (const system of systems.values()) {
    if (!system.structures.length) continue;
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
  buildLayerControls();
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
    row.className = `structure-item${record === selectedRecord ? ' active' : ''}${isRecordVisible(record) ? '' : ' hidden-structure'}`;
    row.style.setProperty('--system-color', record.system.color);
    row.innerHTML = `<i class="structure-dot"></i><span>${record.displayName}</span><span class="eye">${record.visible ? '◉' : '○'}</span>`;
    row.title = `${record.displayName} · ${record.system.label}`;
    row.addEventListener('click', () => selectStructure(record));
    row.querySelector('.eye').addEventListener('click', (event) => {
      event.stopPropagation(); record.visible = !record.visible; applyVisibility(); buildStructureBrowser();
    });
    group.append(row);
  }
  $('#visible-count').textContent = `${entries.filter(isRecordVisible).length} shown`;
}
function applyVisibility() {
  for (const system of systems.values()) {
    system.group.visible = system.visible;
    for (const record of system.structures) record.root.visible = record.visible && (layerForRecord(record)?.visible ?? true);
  }
  if (isolatedKey) applyIsolation();
  updateAnnotation();
  updateAnatomyLabels();
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
  const layer = layerForRecord(record);
  if (!record.visible || !record.system.visible || (layer && !layer.visible)) {
    record.visible = true;
    record.system.visible = true;
    if (layer) layer.visible = true;
    buildSystemControls();
    applyVisibility();
  }
  clearHighlight();
  selectedRecord = record;
  setHighlight(record, true);
  if (isolatedKey) { isolatedKey = record.key; applyIsolation(); }
  updateStructureInfo(record);
  updateAnatomyLabels();
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
  const verticalDistance = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.72);
  const horizontalDistance = size.x / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.aspect * 0.72);
  const distance = Math.max(verticalDistance, horizontalDistance, 1.35);
  const anteriorThreeQuarter = new THREE.Vector3(0.24, 0, 0.971).normalize();
  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(anteriorThreeQuarter, distance);
  controls.minDistance = Math.max(0.4, size.y * 0.58);
  controls.maxDistance = Math.max(7, size.y * 5.5);
  controls.update();
}
function applyIsolation() {
  for (const system of systems.values()) {
    for (const record of system.structures) {
      record.root.visible = isRecordVisible(record);
      for (const mesh of record.meshes) {
        const materials = record.initialMaterials.get(mesh);
        const list = Array.isArray(materials) ? materials : [materials];
        const fade = Boolean(isolatedKey) && record.key !== isolatedKey;
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
  const record = hoveredRecord || selectedRecord;
  if (!labelsEnabled || !record || !isAnatomyVisible(record.root) || anatomyLabelNodes.has(record.name)) { annotation.hidden = true; return; }
  const bounds = record.bounds;
  if (bounds.isEmpty()) { annotation.hidden = true; return; }
  const point = bounds.getCenter(annotationProjectionPoint).project(camera);
  if (point.z < -1 || point.z > 1) { annotation.hidden = true; return; }
  const x = (point.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-point.y * 0.5 + 0.5) * window.innerHeight;
  annotation.textContent = record.displayName;
  annotation.style.left = `${x + 12}px`;
  annotation.style.top = `${y - 12}px`;
  annotation.hidden = false;
}
function buildAnatomyLabels() {
  const container = $('#anatomy-labels');
  const leaderSvg = container.querySelector('.label-leaders');
  container.replaceChildren(leaderSvg);
  leaderSvg.replaceChildren();
  anatomyLabelNodes.clear();
  anatomyLeaderLines.clear();
  anatomyLabelMeshes.length = 0;
  for (const [key, definition] of Object.entries(anatomyLabelDefinitions)) {
    const record = structures.get(key);
    if (!record) continue;
    const label = document.createElement('button');
    label.className = 'anatomy-label';
    label.type = 'button';
    label.dataset.align = definition.align;
    label.textContent = definition.text;
    label.setAttribute('aria-label', `Select ${record.displayName}`);
    label.addEventListener('click', () => selectStructure(structures.get(key), { focus: false }));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.dataset.structure = key;
    leaderSvg.append(line);
    container.append(label);
    anatomyLabelNodes.set(key, label);
    anatomyLeaderLines.set(key, line);
    anatomyLabelMeshes.push(...record.meshes);
  }
  updateAnatomyLabels();
}
function updateAnatomyLabels() {
  const container = $('#anatomy-labels');
  container.hidden = !labelsEnabled;
  const hoveredLabelRecord = hoveredRecord && anatomyLabelNodes.has(hoveredRecord.name) ? hoveredRecord : null;
  const selectedLabelRecord = selectedRecord && anatomyLabelNodes.has(selectedRecord.name) ? selectedRecord : null;
  const activeRecord = hoveredLabelRecord || selectedLabelRecord;
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const [key, label] of anatomyLabelNodes) {
    const line = anatomyLeaderLines.get(key);
    const record = structures.get(key);
    if (!labelsEnabled || !record || record !== activeRecord || !isAnatomyVisible(record.root)) {
      label.hidden = true;
      line.style.display = 'none';
      continue;
    }
    const point = record.bounds.getCenter(anatomyLabelProjectionPoint).project(camera);
    const x = (point.x * 0.5 + 0.5) * width;
    const y = (-point.y * 0.5 + 0.5) * height;
    if (point.z < -1 || point.z > 1 || x < 0 || x > width || y < 64 || y > height - 45) {
      label.hidden = true;
      line.style.display = 'none';
      continue;
    }
    const definition = anatomyLabelDefinitions[key];
    const labelX = THREE.MathUtils.clamp(x + definition.x, 8, width - 8);
    const labelY = THREE.MathUtils.clamp(y + definition.y, 72, height - 72);
    label.dataset.align = definition.align;
    label.style.left = `${labelX}px`;
    label.style.top = `${labelY}px`;
    label.hidden = false;
    line.setAttribute('x1', `${x}`);
    line.setAttribute('y1', `${y}`);
    line.setAttribute('x2', `${labelX}`);
    line.setAttribute('y2', `${labelY}`);
    line.style.display = '';
  }
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2100);
}

function pickAt(event, targets = anatomyRoot.children) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(targets, true).find((hit) => isAnatomyVisible(hit.object) && hit.object.userData.structureKey);
}
let pointerDown = null;
canvas.addEventListener('pointerdown', (event) => { if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointermove', (event) => {
  if (pointerDown || !anatomyLabelMeshes.length) return;
  const hit = pickAt(event, anatomyLabelMeshes);
  const next = hit ? structures.get(hit.object.userData.structureKey) : null;
  if (next === hoveredRecord) return;
  hoveredRecord = next;
  updateAnnotation();
  updateAnatomyLabels();
});
canvas.addEventListener('pointerleave', () => {
  if (!hoveredRecord) return;
  hoveredRecord = null;
  updateAnnotation();
  updateAnatomyLabels();
});
canvas.addEventListener('pointercancel', () => { pointerDown = null; });
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
$('#clear-selection').addEventListener('click', () => {
  clearHighlight();
  selectedRecord = null;
  updateStructureInfo(null);
  buildStructureBrowser();
  updateAnnotation();
  updateAnatomyLabels();
});
$('#reset-layers').addEventListener('click', () => {
  for (const system of systems.values()) { system.visible = true; for (const record of system.structures) record.visible = true; }
  for (const layer of layerDefinitions) if (layer.available !== false) layer.visible = true;
  if (isolatedKey) { isolatedKey = null; applyIsolation(); }
  applyVisibility(); buildSystemControls(); buildStructureBrowser();
  $('#isolate-state').hidden = true; showToast('All available anatomy layers are visible');
});
$('#isolate').addEventListener('click', () => { if (!selectedRecord) return; setIsolation(selectedRecord.key); });
$('#show-all').addEventListener('click', () => { isolatedKey = null; applyIsolation(); });
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
  front: { direction: new THREE.Vector3(0.24, 0, 0.971).normalize(), up: new THREE.Vector3(0, 1, 0), label: 'ANTERIOR · 3/4' },
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
  labelsEnabled = !labelsEnabled; $('#labels').classList.toggle('selected', labelsEnabled); updateAnnotation(); updateAnatomyLabels();
});
function setInterfaceHidden(hidden) {
  document.body.classList.toggle('interface-hidden', hidden);
  const button = $('#interface-toggle');
  button.textContent = hidden ? 'Show interface' : 'Hide interface';
  button.setAttribute('aria-pressed', String(hidden));
  button.title = hidden ? 'Show the viewer controls' : 'Hide the viewer controls';
}
$('#interface-toggle').addEventListener('click', () => {
  setInterfaceHidden(!document.body.classList.contains('interface-hidden'));
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target.isContentEditable) return;
  if (event.key === '/') { event.preventDefault(); $('#structure-search').focus(); }
  if (event.key.toLowerCase() === 'r') $('#reset-camera').click();
  if (event.key.toLowerCase() === 'h') setInterfaceHidden(!document.body.classList.contains('interface-hidden'));
  if (event.key === 'Escape' && document.body.classList.contains('interface-hidden')) setInterfaceHidden(false);
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
    layers: Object.fromEntries(layerDefinitions.filter((layer) => layer.available !== false).map((layer) => [layer.id, layer.visible])),
    structures: Object.fromEntries([...structures].map(([key, record]) => [key, record.visible])),
  };
  localStorage.setItem('mediview-anatomy-view', JSON.stringify(state));
  $('#restore-view').disabled = false;
  showToast('View saved on this device');
}
$('#save-view').addEventListener('click', saveView);
function restoreView() {
  try {
    const state = JSON.parse(localStorage.getItem('mediview-anatomy-view') || 'null');
    if (!state) return;
    camera.position.fromArray(state.camera); controls.target.fromArray(state.target); camera.up.fromArray(state.up);
    for (const [id, visible] of Object.entries(state.systems || {})) if (systems.has(id)) systems.get(id).visible = visible;
    for (const [id, visible] of Object.entries(state.layers || {})) {
      const layer = layerDefinitions.find((item) => item.id === id && item.available !== false);
      if (layer) layer.visible = visible;
    }
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
loadSkeleton().then(() => loadNamedAnatomy()).then(() => {
  setLoadText(`${structures.size} structures · Artec Group scan · CC BY 3.0`);
  updateStructureCount(); buildSystemControls(); buildStructureBrowser();
  buildAnatomyLabels();
  $('#restore-view').disabled = !localStorage.getItem('mediview-anatomy-view');
}).catch((error) => {
  console.error('Anatomy model load failed', error);
  setLoadText(`Some anatomy assets could not be loaded: ${error.message || 'check your connection and refresh.'}`, true);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  updateAnnotation();
  updateAnatomyLabels();
}
animate();
