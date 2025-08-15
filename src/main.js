import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SignaturePad from 'signature_pad';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c1810); // Dark brownish background

// Camera setup
const camera = new THREE.PerspectiveCamera(
  75, // Field of view
  window.innerWidth / window.innerHeight, // Aspect ratio
  0.1, // Near clipping plane
  1000 // Far clipping plane
);
camera.position.set(3, 2, 5); // Positioned to see the closed card at an angle

const textureLoader = new THREE.TextureLoader();
const frontTexture = textureLoader.load('../public/BACK HURTED.jpeg');
const insideTexture = textureLoader.load(
  '../public/back restored.jpeg'
);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffa500, 0.8); // Orange tint
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Add a softer fill light
const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-5, 3, 2);
scene.add(fillLight);

// Card dimensions
const cardWidth = 2.5;
const cardHeight = 3.5;
const cardGeometry = new THREE.PlaneGeometry(cardWidth, cardHeight);

// Materials with single-sided rendering
const frontCoverMaterial = new THREE.MeshLambertMaterial({
  map: frontTexture,
  side: THREE.FrontSide
});

const insideMaterial = new THREE.MeshLambertMaterial({
  map: insideTexture,
  side: THREE.FrontSide
});

// Create the hinge group (this will be our rotation point)
const cardGroup = new THREE.Group();

// Card thickness to prevent z-fighting
const cardThickness = 0.02;

// Back panel (stays put) - extends to the right from the hinge
const backPanel = new THREE.Mesh(cardGeometry, insideMaterial);
backPanel.position.x = cardWidth / 2; // Position so left edge is at origin (hinge)
backPanel.position.z = -cardThickness / 2; // Back of the card
cardGroup.add(backPanel);

// Front cover - will rotate around the hinge (this is what opens)
const frontCoverGroup = new THREE.Group(); // Separate group for the front cover
const frontCover = new THREE.Mesh(cardGeometry, frontCoverMaterial);
frontCover.position.x = cardWidth / 2; // Position so left edge is at origin (hinge)
frontCover.position.z = cardThickness / 2; // Front of the card
frontCover.rotation.y = 0; // Start at 0° (closed position, showing front design)
frontCoverGroup.add(frontCover);

cardGroup.add(frontCoverGroup);
scene.add(cardGroup);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 12;
controls.minDistance = 3;

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Card opening/closing animation
let isOpen = false;
let isAnimating = false;

function toggleCard() {
  if (isAnimating) return;

  isAnimating = true;
  const startRotation = frontCoverGroup.rotation.y;
  const targetRotation = isOpen ? 0 : -Math.PI; // Closed = 0, Open = -π (opens left)
  const duration = 1200; // 1.2 seconds for a nice slow open
  const startTime = Date.now();

  function animateOpen() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Use easeOutCubic for natural opening motion
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    frontCoverGroup.rotation.y =
      startRotation +
      (targetRotation - startRotation) * easedProgress;

    if (progress < 1) {
      requestAnimationFrame(animateOpen);
    } else {
      isOpen = !isOpen;
      isAnimating = false;
    }
  }

  animateOpen();
}

// Add keyboard handler (spacebar to open/close)
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    toggleCard();
  }
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls
  controls.update();

  // Render the scene
  renderer.render(scene, camera);
}

// Start the animation
animate();

// Signature system
let signatures = [];
let signaturePad;

// Dynamic texture canvases for signatures
let frontSignatureCanvas;
let backSignatureCanvas;
let frontSignatureTexture;
let backSignatureTexture;

// Initialize signature canvases
function initializeSignatureCanvases() {
  // Create canvases for signature overlays
  frontSignatureCanvas = document.createElement('canvas');
  backSignatureCanvas = document.createElement('canvas');

  // Set canvas size to match card texture resolution
  const canvasWidth = 512;
  const canvasHeight = 512;

  frontSignatureCanvas.width = canvasWidth;
  frontSignatureCanvas.height = canvasHeight;
  backSignatureCanvas.width = canvasWidth;
  backSignatureCanvas.height = canvasHeight;

  // Create Three.js textures from these canvases
  frontSignatureTexture = new THREE.CanvasTexture(
    frontSignatureCanvas
  );
  backSignatureTexture = new THREE.CanvasTexture(backSignatureCanvas);

  // Initial clear canvases
  updateSignatureTextures();
}

function updateSignatureTextures() {
  // Clear both canvases to transparent
  const frontCtx = frontSignatureCanvas.getContext('2d');
  const backCtx = backSignatureCanvas.getContext('2d');

  frontCtx.clearRect(
    0,
    0,
    frontSignatureCanvas.width,
    frontSignatureCanvas.height
  );
  backCtx.clearRect(
    0,
    0,
    backSignatureCanvas.width,
    backSignatureCanvas.height
  );

  // Track completed signature draws
  let completedDraws = 0;
  const totalSignatures = signatures.length;

  if (totalSignatures === 0) {
    // No signatures, just update textures
    frontSignatureTexture.needsUpdate = true;
    backSignatureTexture.needsUpdate = true;
    return;
  }

  // Draw signatures on appropriate sides
  signatures.forEach((sig, index) => {
    const img = new Image();
    img.onload = () => {
      // Alternate between back (inside) and front cover
      const ctx = index % 2 === 0 ? backCtx : frontCtx; // Even = back (inside), Odd = front

      // Position signatures in a grid
      const x = (index % 3) * 150 + 30;
      const y = Math.floor(index / 3) * 120 + 30;

      // Draw signature with semi-transparent background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(x - 5, y - 5, 130, 90);

      // Draw signature (scale down to fit)
      ctx.drawImage(img, x, y, 120, 60);

      // Draw name below signature
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(sig.name, x, y + 80);

      completedDraws++;

      // Update Three.js textures when all signatures are drawn
      if (completedDraws === totalSignatures) {
        frontSignatureTexture.needsUpdate = true;
        backSignatureTexture.needsUpdate = true;

        // Apply signature textures as overlays
        applySignatureOverlays();
      }
    };
    img.src = sig.signature;
  });
}

function applySignatureOverlays() {
  // For now, we'll create composite textures
  // In a more advanced version, we could use multiple texture layers

  // Update front cover with signature overlay
  if (signatures.some((_, i) => i % 2 === 1)) {
    // If any odd-indexed signatures (front)
    const frontCanvas = document.createElement('canvas');
    const frontCtx = frontCanvas.getContext('2d');
    frontCanvas.width = 512;
    frontCanvas.height = 512;

    // Draw base texture
    const frontImg = new Image();
    frontImg.crossOrigin = 'anonymous';
    frontImg.onload = () => {
      frontCtx.drawImage(frontImg, 0, 0, 512, 512);
      // Overlay signatures
      frontCtx.drawImage(frontSignatureCanvas, 0, 0);

      // Create new texture and apply
      const compositeTexture = new THREE.CanvasTexture(frontCanvas);
      frontCover.material.map = compositeTexture;
      frontCover.material.needsUpdate = true;
    };
    frontImg.src =
      frontTexture.image.src || '../public/BACK HURTED.jpeg';
  }

  // Update back panel with signature overlay
  if (signatures.some((_, i) => i % 2 === 0)) {
    // If any even-indexed signatures (back)
    const backCanvas = document.createElement('canvas');
    const backCtx = backCanvas.getContext('2d');
    backCanvas.width = 512;
    backCanvas.height = 512;

    // Draw base texture
    const backImg = new Image();
    backImg.crossOrigin = 'anonymous';
    backImg.onload = () => {
      backCtx.drawImage(backImg, 0, 0, 512, 512);
      // Overlay signatures
      backCtx.drawImage(backSignatureCanvas, 0, 0);

      // Create new texture and apply
      const compositeTexture = new THREE.CanvasTexture(backCanvas);
      backPanel.material.map = compositeTexture;
      backPanel.material.needsUpdate = true;
    };
    backImg.src =
      insideTexture.image.src || '../public/back restored.jpeg';
  }
}

// Create signature modal HTML
function createSignatureUI() {
  const modalHTML = `
    <div id="signature-modal" style="
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    ">
      <div style="
        background: #2c1810;
        padding: 30px;
        border-radius: 10px;
        border: 2px solid #8B4513;
        max-width: 500px;
        width: 90%;
      ">
        <h2 style="color: #DAA520; margin-bottom: 20px; font-family: serif;">Sign the Card</h2>
        
        <div style="margin-bottom: 15px;">
          <label style="color: #F5F5DC; display: block; margin-bottom: 5px;">Your Name:</label>
          <input 
            type="text" 
            id="signer-name" 
            placeholder="Enter your name"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #8B4513;
              background: #F5F5DC;
              border-radius: 4px;
            "
          >
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="color: #F5F5DC; display: block; margin-bottom: 5px;">Your Signature:</label>
          <canvas 
            id="signature-canvas"
            style="
              border: 2px solid #8B4513;
              background: white;
              border-radius: 4px;
              display: block;
              touch-action: none;
            "
            width="400"
            height="150"
          ></canvas>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button 
            id="clear-signature"
            style="
              padding: 10px 20px;
              background: #8B4513;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            "
          >Clear</button>
          <button 
            id="cancel-signature"
            style="
              padding: 10px 20px;
              background: #666;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            "
          >Cancel</button>
          <button 
            id="save-signature"
            style="
              padding: 10px 20px;
              background: #DAA520;
              color: #2c1810;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-weight: bold;
            "
          >Sign Card</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Initialize SignaturePad
  const canvas = document.getElementById('signature-canvas');
  signaturePad = new SignaturePad(canvas, {
    backgroundColor: 'rgba(255, 255, 255, 1)',
    penColor: 'rgb(0, 0, 0)'
  });

  // Event listeners
  document
    .getElementById('clear-signature')
    .addEventListener('click', () => {
      signaturePad.clear();
    });

  document
    .getElementById('cancel-signature')
    .addEventListener('click', closeSignatureModal);
  document
    .getElementById('save-signature')
    .addEventListener('click', saveSignature);

  // Close modal when clicking outside
  document
    .getElementById('signature-modal')
    .addEventListener('click', (e) => {
      if (e.target.id === 'signature-modal') {
        closeSignatureModal();
      }
    });
}

function openSignatureModal() {
  document.getElementById('signature-modal').style.display = 'flex';
  document.getElementById('signer-name').value = '';
  signaturePad.clear();
  document.getElementById('signer-name').focus();
}

function closeSignatureModal() {
  document.getElementById('signature-modal').style.display = 'none';
}

function saveSignature() {
  const name = document.getElementById('signer-name').value.trim();

  if (!name) {
    alert('Please enter your name');
    return;
  }

  if (signaturePad.isEmpty()) {
    alert('Please provide a signature');
    return;
  }

  // Get signature as data URL
  const signatureData = signaturePad.toDataURL();

  // Store signature
  const signature = {
    name: name,
    signature: signatureData,
    timestamp: new Date().toISOString()
  };

  signatures.push(signature);
  console.log('New signature added:', signature);

  // Apply signatures to card
  updateSignatureTextures();

  closeSignatureModal();

  // For now, just log the signatures
  console.log('All signatures:', signatures);
}

// Initialize signature system
initializeSignatureCanvases();

// Update materials to use signature overlays
function updateCardMaterials() {
  // Create new materials that combine base textures with signature overlays
  frontCover.material = new THREE.MeshLambertMaterial({
    map: frontTexture,
    side: THREE.FrontSide,
    transparent: true
  });

  backPanel.material = new THREE.MeshLambertMaterial({
    map: insideTexture,
    side: THREE.FrontSide,
    transparent: true
  });

  // Add signature overlays (we'll blend these on top)
  // This will be updated in updateSignatureTextures
}

updateCardMaterials();

// Create signature modal on load
createSignatureUI();

// Add sign button (temporary - can be styled better later)
const signButton = document.createElement('button');
signButton.textContent = 'Sign Card';
signButton.style.cssText = `
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 100;
  padding: 12px 20px;
  background: #DAA520;
  color: #2c1810;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  font-size: 16px;
`;
signButton.addEventListener('click', openSignatureModal);
document.body.appendChild(signButton);

// Export the important objects for later use
export {
  scene,
  camera,
  renderer,
  cardGroup,
  frontCover,
  backPanel,
  toggleCard
};
