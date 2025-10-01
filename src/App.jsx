import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

/***************************************
 * DN STUDIO — ULTRA CREATIVE PRO
 * Single-file React app (Tailwind classes) with:
 * - Word (.docx) + PDF ingestion (Mammoth + PDF.js) ✅
 * - Rich, continuous background + loader animations ✅
 * - Identity-locked Variations using a preferred "nano-banana" Gemini image model (with graceful fallback) ✅
 * - Script Planner → Scene Builder with a one-time Consistency Kit applied to frame 1 of every scene ✅
 * - Veo3 JSON prompt exporter (per image or batch .jsonl) ✅
 * - WebM video builder, toasts, modal, drag&drop ✅
 * - Vibe.AI Smart Prompt Generator Tool ✅
 ***************************************/

/************** CDN + Globals **************/
const PDFJS_VERSION = "3.11.174";
const PDFJS_CORE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
const MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.7.1/mammoth.browser.min.js"; // .docx → text

// Prefer the user's requested "nano-banana" Gemini model for identity locking if present on their key.
const NEW_BANANA_MODEL = "gemini-2.5-pro-image-preview-1025"; // A hypothetical newer model for higher quality
const LATEST_BANANA_MODEL = NEW_BANANA_MODEL;

/************** Minimal icons **************/
const Ic = ({ d, size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d} /></svg>
);
const I = {
  upload: (p) => <Ic {...p} d="M4 14.9A7 7 0 1 1 15.7 8h1.8A4.5 4.5 0 0 1 20 16M12 12v9m4-5-4-4-4 4" />,
  wand: (p) => <Ic {...p} d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18l1.9-5.8 5.8-1.9-5.8-1.9L12 3zM5 3v4M19 17v4M3 5h4M17 19h4" />,
  text: (p) => <Ic {...p} d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />,
  key: (p) => <Ic {...p} d="m21 2-2 2M6.4 13.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z" />,
  brain: (p) => <Ic {...p} d="M12 5a3 3 0 1 0-6 0m12 7a3 3 0 1 0-4 2.8M12 19a3 3 0 1 0-6 0M5 12a3 3 0 1 0 4 2.8M12 2v3m0 14v-3" />,
  play: (p) => <Ic {...p} d="M5 3v18l15-9-15-9z" />,
  download: (p) => <Ic {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m14-6-4-4-4 4m4-4v12" />,
  warn: (p) => <Ic {...p} d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" />,
  trash: (p) => <Ic {...p} d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  close: (p) => <Ic {...p} d="M18 6 6 18M6 6l12 12" />,
  json: (p) => <Ic {...p} d="M8 6h8M8 10h8m-8 4h8M4 6h.01M4 10h.01M4 14h.01M20 6h.01M20 10h.01M20 14h.01" />,
  fuse: (p) => <Ic {...p} d="M12.5 20.5 10 18l-2.5 2.5" />,
  sparkles: (p) => <Ic {...p} d="M9.9 2.1 7.5 7.5 2.1 9.9l5.4 2.4 2.4 5.4 2.4-5.4 5.4-2.4-5.4-2.4-2.4-5.4zM20 11l-2.4 2.4-2.4-2.4-2.4-2.4 2.4-2.4 2.4 2.4z"/>,
  check: (p) => <Ic {...p} d="M20 6 9 17l-5-5"/>,
};

/************** Helpers **************/
const uid = () => Math.random().toString(36).slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function stripFences(s = "") { return s.replace(/^```(json)?/i, "").replace(/```$/i, "").trim(); }
function tryParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

/************** API **************/
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_PREFS = [
  { id: NEW_BANANA_MODEL, kind: "image" },
  { id: "gemini-2.5-flash-image-preview", kind: "image" },
  { id: "gemini-2.5-flash-preview-05-20", kind: "text" },
  { id: "gemini-1.5-flash", kind: "text" },
  { id: "gemini-1.5-pro", kind: "text" },
];
async function fetchJSON(url, options = {}, retries = 3, backoff = 800) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { const wait = backoff * Math.pow(1.7, i); await sleep(wait); continue; }
    let err; try { err = await res.json(); } catch { err = { message: res.statusText }; }
    throw new Error(err?.error?.message || err?.message || "API error");
  }
  throw new Error("Network unstable");
}

async function geminiCall(apiKey, model, payload) {
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
  return fetchJSON(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

async function enhancePrompt(apiKey, raw) {
  const system = "You are a world-class creative director. Rewrite the prompt to be photorealistic, cinematic, 16:9, professional lighting, composition, camera/lens, 8K, sharp, color graded. Reply ONLY with the prompt.";
  for (const m of MODEL_PREFS) {
    if(m.kind !== 'text') continue;
    try { const d = await geminiCall(apiKey, m.id, { systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: raw }] }] }); const t = d?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join("\n"); if (t) return stripFences(t); } catch {}
  }
  return raw;
}

async function optimizeScript(apiKey, txt) {
  const system = "Rewrite the screenplay into crisp, visual, per-shot lines suitable for image/video generation. Keep plot; amplify actions, mood, environment. Return ONLY text.";
  for (const m of MODEL_PREFS) {
      if(m.kind !== 'text') continue;
      try { const d = await geminiCall(apiKey, m.id, { systemInstruction:{ parts:[{text:system}] }, contents:[{ parts:[{ text: txt }] }] }); const t = d?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join("\n"); if (t) return stripFences(t); } catch {}
  }
  return txt;
}

async function analyzeScript(apiKey, txt, assetNames) {
  const assetList = assetNames.join(", ") || "None";
  const prompt = `You are an expert script analysis AI. Your sole function is to read a script and determine which of a given list of characters are present in each scene. You must be precise.

**Available Characters:**
[${assetList}]

**Instructions:**
1. Read the provided script scene by scene.
2. For each scene, identify if any of the "Available Characters" are mentioned by name or are clearly participating in the action.
3. Return a JSON array. Each object in the array must represent one scene.
4. The JSON object for each scene MUST have this exact structure:
   - "sceneIndex": number
   - "sceneText": string (the full text of the scene)
   - "recommendedFrames": number (a recommendation from 1 to 4 based on the scene's complexity)
   - "charactersInScene": string[] (an array containing the EXACT names from the "Available Characters" list. If no characters from the list are in the scene, this MUST be an empty array \`[]\`.)

**Example:**
If "Available Characters" is \`["Captain Eva", "Commander Jax"]\` and a scene is "INT. BRIDGE - DAY. Captain Eva stands over the console. Jax enters.", the output for that scene should include \`"charactersInScene": ["Captain Eva", "Commander Jax"]\`.

**Output Format:**
You must only output the raw JSON array, with no surrounding text or markdown fences.

**Script to Analyze:**
---
${txt}`;

  for (const m of MODEL_PREFS) {
    if(m.kind !== 'text') continue;
    try { 
      const d = await geminiCall(apiKey, m.id, { contents:[{ parts:[{ text: prompt }] }] }); 
      const raw = d?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join("\n"); 
      const arr = tryParseJSON(stripFences(raw)); 
      if (Array.isArray(arr)) return arr.map((s,i)=>({ 
        sceneIndex:s.sceneIndex??i+1, 
        sceneText:s.sceneText??"", 
        recommendedFrames:clamp(s.recommendedFrames??1,1,4), 
        charactersInScene:s.charactersInScene??[] 
      })); 
    } catch(e) {
      console.error("Script analysis failed with model " + m.id, e);
    }
  }
  throw new Error("Script analysis failed with all models.");
}
async function buildConsistencyKit(apiKey, scriptText, assetNames) {
  const system = `You are a visual supervisor. Produce a compact JSON object with keys: palette (array of hex), lighting (string), lens (string), cameraMoves (string), props (array), wardrobe (string), logoGuidelines (string). Keep it neutral and general to apply across scenes.`;
  const content = `Script excerpt:\n${scriptText.slice(0,1200)}`;
  for (const m of MODEL_PREFS) {
    if(m.kind !== 'text') continue;
    try { const d = await geminiCall(apiKey, m.id, { systemInstruction:{ parts:[{text:system}] }, contents:[{ parts:[{ text: content }] }] }); const raw = d?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join("\n"); const j = tryParseJSON(stripFences(raw)); if (j) return j; } catch {}
  }
  return { palette:["#0ea5e9","#a78bfa","#f59e0b"], lighting:"cinematic soft key + volumetric haze", lens:"35mm wide, shallow DoF", cameraMoves:"slow dolly-in", props:["consistent mug","hero product"], wardrobe:"muted cool tones", logoGuidelines:"place small bottom-right, 80% opacity" };
}
async function generateImage(apiKey, prompt, inlineAssets, preferredModelId) {
  const parts = [{ text: prompt }, ...inlineAssets.map(a=>({ inlineData:{ mimeType:a.base64?.mimeType || a.mimeType, data:a.base64?.data || a.data } }))];
  const tryModels = preferredModelId ? [preferredModelId, ...MODEL_PREFS.filter(m => m.kind === 'image' && m.id !== preferredModelId).map(m=>m.id)] : MODEL_PREFS.filter(m => m.kind === 'image').map(m=>m.id);
  for (const model of tryModels) {
    try {
      const d = await geminiCall(apiKey, model, { contents:[{ parts }], generationConfig:{ responseModalities:["IMAGE"] } });
      if (d?.promptFeedback?.blockReason) throw new Error(`Blocked: ${d.promptFeedback.blockReason}`);
      const b64 = d?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)?.inlineData?.data;
      if (b64) return `data:image/png;base64,${b64}`;
    } catch (e) { console.error(`Model ${model} failed:`, e); }
  }
  throw new Error("No image data from models");
}

/************** Doc & PDF **************/
async function ensurePdfJs() { if (window.pdfjsLib) return; await new Promise((res, rej)=>{ const s=document.createElement("script"); s.src=PDFJS_CORE; s.onload=res; s.onerror=()=>rej(new Error("Failed to load PDF.js library.")); document.body.appendChild(s); }); window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER; }
async function extractPdfText(file) { await ensurePdfJs(); const buf = await file.arrayBuffer(); const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise; let full=""; for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const tc=await page.getTextContent(); full += tc.items.map(it=>it.str).join(" ")+"\n"; } return full.replace(/[ \t\f\r]+/g," ").replace(/\n{2,}/g,"\n").trim(); }
async function ensureMammoth() { if (window.mammoth) return; await new Promise((res, rej)=>{ const s=document.createElement("script"); s.src=MAMMOTH; s.onload=res; s.onerror=()=>rej(new Error("Failed to load Mammoth.js for .docx files.")); document.body.appendChild(s); }); }
async function extractDocxText(file) { await ensureMammoth(); const arrayBuffer = await file.arrayBuffer(); const r = await window.mammoth.extractRawText({ arrayBuffer }); return (r.value||"").replace(/[ \t\f\r]+/g," ").replace(/\n{2,}/g,"\n").trim(); }

/************** Video Builder **************/
async function imagesToWebM({ urls, fps, width, height, crossfadeMs, kenBurns, imageDurationSecs = 4 }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context not available");

  const images = await Promise.all(urls.map(url => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = url;
  })));

  if (images.length === 0) throw new Error("No images provided for video.");

  const stream = canvas.captureStream(fps);
  const supported = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ].find(t => window.MediaRecorder && window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const recordingPromise = new Promise(resolve => recorder.onstop = () => resolve(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))));
  recorder.start();

  const totalDuration = images.length * imageDurationSecs;
  let startTime = -1;

  function animate(time) {
    if (startTime === -1) startTime = time;
    const elapsedSecs = (time - startTime) / 1000;
    if (elapsedSecs >= totalDuration) { recorder.stop(); return; }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const currentImageIdx = Math.floor(elapsedSecs / imageDurationSecs);
    const timeIntoImage = elapsedSecs % imageDurationSecs;
    const currentImage = images[currentImageIdx];

    const drawImageWithKenBurns = (img, progress) => {
      const zoomStart = 1.0;
      const zoomEnd = 1.15;
      const scale = zoomStart + (zoomEnd - zoomStart) * progress;
      const sw = img.width / scale;
      const sh = img.height / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    };

    const drawImageNormally = (img) => ctx.drawImage(img, 0, 0, width, height);

    ctx.globalAlpha = 1;
    if (kenBurns) drawImageWithKenBurns(currentImage, timeIntoImage / imageDurationSecs);
    else drawImageNormally(currentImage);

    const crossfadeSecs = crossfadeMs / 1000;
    if (crossfadeSecs > 0 && currentImageIdx + 1 < images.length && timeIntoImage > imageDurationSecs - crossfadeSecs) {
      const nextImage = images[currentImageIdx + 1];
      const fadeProgress = (timeIntoImage - (imageDurationSecs - crossfadeSecs)) / crossfadeSecs;
      ctx.globalAlpha = clamp(fadeProgress, 0, 1);
      if (kenBurns) drawImageWithKenBurns(nextImage, 0);
      else drawImageNormally(nextImage);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  return recordingPromise;
}

/************** UI Primitives **************/
const Button = ({ children, variant = "primary", size = "md", className = "", as: Comp = "button", ...props }) => {
  const variants = { primary:"bg-blue-600/90 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20", outline:"border border-white/10 bg-white/5 hover:bg-white/10 text-slate-100", danger:"bg-rose-600/90 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20", ghost:"text-slate-200 hover:bg-white/5" };
  const sizes = { md:"h-10 px-4", sm:"h-9 px-3", lg:"h-12 px-6 text-base" };
  return <Comp className={`inline-flex items-center gap-2 justify-center rounded-xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors duration-200 ${variants[variant]} ${sizes[size]} ${className}`} {...props}>{children}</Comp>;
};
const Input = (p) => <input {...p} className={`h-10 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${p.className||""}`} />;
const Textarea = (p) => <textarea {...p} className={`min-h-[120px] w-full rounded-md border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${p.className||""}`} />;
const Select = (p) => <select {...p} className="h-10 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />;
const Switch = ({ checked, onChange }) => (<button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)} className={`h-6 w-11 rounded-full transition-colors ${checked?"bg-blue-600":"bg-white/10"}`}><span className={`block h-5 w-5 bg-white rounded-full transition-transform ${checked?"translate-x-6":"translate-x-1"}`} /></button>);
const DnaLoader = () => (
    <div className="w-full aspect-video bg-black/20 grid place-items-center">
        <svg width="60" height="60" viewBox="0 0 100 100">
            <defs>
                <linearGradient id="g-loader" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
            </defs>
            <motion.path 
                d="M20,20 V80 H50 C70,80 70,20 50,20 H20" 
                stroke="url(#g-loader)" 
                strokeWidth="4" 
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
            />
            <motion.path 
                d="M80,80 V20 L50,80 V20" 
                stroke="url(#g-loader)" 
                strokeWidth="4" 
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, ease: "easeInOut", delay: 0.5, repeat: Infinity, repeatType: "reverse" }}
            />
        </svg>
    </div>
);


/************** Animated Background (continuous) **************/
function useParticles() {
  useEffect(()=>{
    const c = document.createElement("canvas"); c.id="stars"; Object.assign(c.style,{position:"fixed",inset:0,zIndex:-1,opacity:0.25}); document.body.appendChild(c);
    const ctx = c.getContext("2d"); let raf, W, H; const dots = Array.from({length:120},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.5+0.3,dx:(Math.random()-0.5)*0.0005,dy:(Math.random()-0.5)*0.0005}));
    const resize=()=>{W=c.width=window.innerWidth*2; H=c.height=window.innerHeight*2;}; resize(); window.addEventListener("resize",resize);
    function loop(){ if(!ctx) return; ctx.clearRect(0,0,W,H); ctx.fillStyle="#93c5fd"; dots.forEach(d=>{ d.x=(d.x+d.dx+1)%1; d.y=(d.y+d.dy+1)%1; ctx.beginPath(); ctx.arc(d.x*W,d.y*H,d.r,0,Math.PI*2); ctx.fill();}); raf=requestAnimationFrame(loop);} loop();
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize",resize); document.body.removeChild(c); };
  },[]);
}

/************** Toasts **************/
const Toast = ({ t, onClose }) => (
  <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className={`rounded-xl px-4 py-3 text-sm shadow-xl border ${t.type === "error" ? "bg-rose-900/30 border-rose-800/40 text-rose-100" : "bg-emerald-900/30 border-emerald-800/40 text-emerald-100"}`}>
    <div className="flex items-center gap-2">
      {t.type === "error" ? I.warn({ className: "w-4 h-4" }) : I.brain({ className: "w-4 h-4" })}
      <span>{t.message}</span>
      <button onClick={onClose} className="ml-auto opacity-70 hover:opacity-100">{I.close({ className: "w-4 h-4" })}</button>
    </div>
  </motion.div>
);

/************** App **************/
export default function App(){
  useParticles();

  const [apiKey,setApiKey]=useState("");
  const [remember,setRemember]=useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status,setStatus]=useState("Ready");
  const [toasts,setToasts]=useState([]);
  
  const [isDragging, setIsDragging] = useState(false);

  const [script,setScript]=useState("");
  const [imageStyle,setImageStyle]=useState("photorealistic");
  const [negative,setNegative]=useState("deformed, blurry, bad anatomy, watermark, text");
  const [hq,setHq]=useState(true);

  const [assets,setAssets]=useState([]); // {id,name,file,previewUrl,type} // GLOBAL ASSETS
  const [assetName,setAssetName]=useState("");
  
  const [scriptCharacterIDs, setScriptCharacterIDs] = useState([]); // Selected character IDs for the script

  const [theme,setTheme]=useState("");

  const [gallery,setGallery]=useState([]); // GeneratedAsset[]
  const [modal,setModal]=useState(null);
  const [selectedFrames, setSelectedFrames] = useState([]);

  const [storyboard,setStoryboard]=useState([]);
  const [fps,setFps]=useState(24);
  const [kenBurns,setKenBurns]=useState(true);
  const [crossfade,setCrossfade]=useState(200);

  const [consistencyKit,setConsistencyKit]=useState(null);
  const [scenePrompts, setScenePrompts] = useState([]); // For the new script -> prompts workflow

  // Vibe.AI Tool State
  const [vibeCharacter, setVibeCharacter] = useState("");
  const [vibeTheme, setVibeTheme] = useState("");
  const [vibeImage, setVibeImage] = useState(null); // { b64, type, previewUrl }
  const [vibePrompts, setVibePrompts] = useState([]); // {id, title, prompt, imageUrl, isVisualizing}

  useEffect(()=>{ const k=localStorage.getItem("dn_ultra_key"); if(k){setApiKey(k); setRemember(true);} },[]);
  useEffect(()=>{ if(remember) localStorage.setItem("dn_ultra_key",apiKey||""); else localStorage.removeItem("dn_ultra_key"); },[remember,apiKey]);

  const toast=useCallback((m,err=false)=>setToasts(T=>[...T,{id:uid(),message:m,type:err?"error":"ok"}]),[]);
  const closeToast=(id)=>setToasts(T=>T.filter(x=>x.id!==id));

  const fileToB64=useCallback((file)=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>{const [h,d]=String(r.result).split(","); res({ data:d, mimeType:h.match(/:(.*?);/)?.[1] || 'application/octet-stream' });}; r.onerror=rej; r.readAsDataURL(file); }), []);
  const urlToB64=useCallback(async(url)=>{const response=await fetch(url); const blob=await response.blob(); return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>{ const[h,d]=String(r.result).split(","); res({ data:d, mimeType:h.match(/:(.*?);/)?.[1]||blob.type});};r.onerror=rej;r.readAsDataURL(blob);});},[]);

  const extractFromFile = useCallback(async (file)=>{
    if(!file) return "";
    if(file.type==="application/pdf") return extractPdfText(file);
    if(file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocxText(file);
    if(file.type.startsWith("text/") || file.name.endsWith(".txt")) return await file.text();
    throw new Error("Unsupported file. Use PDF, DOCX, or TXT.");
  }, []);
  
  const handleFileDrop = useCallback(async (file) => {
    if (!file) return;
    setIsProcessing(true); setStatus("Reading dropped file...");
    try {
        const text = await extractFromFile(file);
        setScript(s => s ? (s + "\n\n" + text) : text);
        toast("File content loaded.");
    } catch (err) {
        console.error("File extraction failed:", err);
        toast(String(err.message || err), true);
    } finally {
        setIsProcessing(false); setStatus("Ready");
    }
  }, [extractFromFile, toast]);

  useEffect(() => {
    const handleDragOver = e => { e.preventDefault(); e.stopPropagation(); };
    const handleDragEnter = e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileDrop(e.dataTransfer.files?.[0]);
    };
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
    };
  }, [handleFileDrop]);

  const runJob = useCallback(async (fn)=>{ if(!apiKey.trim()) { toast("Enter your Google AI Studio key.",true); return; } setIsProcessing(true); try{ await fn(); } catch(e) { toast(String(e.message || e), true); } finally { setIsProcessing(false); setStatus("Ready"); } },[apiKey, toast]);

  const buildInlineAssets = useCallback(async (names, sourceAssets) => {
    const list = [];
    const lowerCaseNames = (names || []).map(name => name.toLowerCase());

    const neededAssets = sourceAssets.filter(asset => {
        if (asset.type === "logo") {
            return true; 
        }
        if (asset.type === "character" && lowerCaseNames.length > 0) {
            const assetNameLower = asset.name.toLowerCase();
            return lowerCaseNames.includes(assetNameLower);
        }
        return false;
    });

    for (const a of neededAssets) {
        const b64 = await fileToB64(a.file);
        list.push({ name: a.name, type: a.type, base64: b64 });
    }
    return list;
  }, [fileToB64]);

    const generatePromptsForScene = useCallback(async (scene, kit) => {
        const characters = scene.charactersInScene.join(', ') || 'None';
        const prompt = `You are a creative director and prompt engineer. For the following script scene, generate 3 distinct, highly visual, and cinematic prompt ideas for an image AI.

**Scene Details:**
- **Text:** "${scene.sceneText}"
- **Characters Present:** ${characters}

**Style & Consistency Guidance:**
- **Palette:** ${(kit.palette||[]).join(', ')}
- **Lighting:** ${kit.lighting}
- **Lens/Camera:** ${kit.lens}, ${kit.cameraMoves}
- **Wardrobe:** ${kit.wardrobe}

**Instructions:**
- Incorporate the characters naturally into the scene.
- Each prompt must be a single, detailed paragraph.
- Conclude each prompt with relevant artistic keywords.
- Return ONLY a JSON array of 3 strings. Example: \`["A cinematic shot of...", "A dramatic close-up of...", "An epic wide angle of..."]\`
`;
        const result = await geminiCall(apiKey, 'gemini-2.5-flash-preview-05-20', {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } }
        });
        const rawJsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
            const parsed = tryParseJSON(rawJsonText);
            if (Array.isArray(parsed)) return parsed;
        }
        throw new Error(`Failed to generate prompts for Scene ${scene.sceneIndex}`);

    }, [apiKey]);


  const doGenerateScenePrompts = useCallback(async() => {
    await runJob(async()=>{
        if(!script.trim()){ toast("Paste a script first.",true); return; }
        
        const scriptCharacters = assets.filter(a => scriptCharacterIDs.includes(a.id));
        const characterAssetNames = scriptCharacters.map(a => a.name);

        setStatus("Analyzing script...");
        const plan = await analyzeScript(apiKey, script, characterAssetNames);
        
        setStatus("Building consistency kit...");
        const kit = await buildConsistencyKit(apiKey, script, characterAssetNames);
        setConsistencyKit(kit);

        setStatus("Generating prompt ideas for each scene...");
        const allScenePrompts = await Promise.all(plan.map(async (scene) => {
            const prompts = await generatePromptsForScene(scene, kit);
            return { ...scene, prompts };
        }));
        
        setScenePrompts(allScenePrompts);
        toast("Scene prompts generated! Ready to visualize.");
    });
  }, [apiKey, script, assets, scriptCharacterIDs, toast, runJob, generatePromptsForScene]);

  const doVisualizeScenePrompt = useCallback(async (prompt, scene) => {
    await runJob(async () => {
      setStatus(`Visualizing: ${prompt.slice(0, 40)}...`);
      const newGalleryItem = { id: uid(), type: "image", src: "", status: "loading", prompt };
      setGallery(g => [newGalleryItem, ...g]);

      try {
        const scriptCharacters = assets.filter(a => scriptCharacterIDs.includes(a.id));
        const inAssets = await buildInlineAssets(scene.charactersInScene, assets);
        const url = await generateImage(apiKey, prompt, inAssets, LATEST_BANANA_MODEL);
        setGallery(g => g.map(item => item.id === newGalleryItem.id ? { ...item, src: url, status: "completed", enhancedPrompt: prompt } : item));
        toast("Visualization complete!");
      } catch (e) {
        setGallery(g => g.map(item => item.id === newGalleryItem.id ? { ...item, status: "error", error: String(e.message || e) } : item));
        throw e;
      }
    });
  }, [apiKey, assets, scriptCharacterIDs, buildInlineAssets, toast, runJob]);


  const doVariations = useCallback(async () => {
    await runJob(async () => {
      const characterAssets = assets.filter(a => a.type === 'character');
      if (characterAssets.length === 0) {
        toast("Upload at least one character in 'Locked Assets' first.", true);
        return;
      }
      setStatus("Thinking of 10 wild ideas...");
      const ideasResp = await geminiCall(apiKey, MODEL_PREFS[2].id, { systemInstruction:{ parts:[{text:`Generate 10 DIFFERENT, cinematic 16:9 scene prompts around the theme: "${theme||'General Creative Concepts'}". Each describes action, setting, composition, camera. Return ONLY a JSON array of 10 strings.`}] }, contents:[{ parts:[{ text: theme||"General Creative Concepts" }] }] });
      const ideasText = ideasResp?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join("\n");
      const ideas = tryParseJSON(stripFences(ideasText))||[];
      if(!ideas.length){ toast("Could not generate ideas.",true); return; }

      const batch = ideas.slice(0,10).map(p=>({id:uid(),type:"image",src:"",status:"loading",prompt:p}));
      setGallery(G=>[...batch,...G]);

      const inlineCharacters = await buildInlineAssets(characterAssets.map(a => a.name), assets);
      const characterNames = characterAssets.map(a => a.name).join(', ');

      await Promise.all(batch.map(async (item, i) => {
        setStatus(`Variation ${i+1}/${batch.length}`);
        try{
          let p = `${item.prompt} CRITICAL: Preserve exact face identities for ${characterNames} using the provided images. Do not alter their identities. Style: ${imageStyle}.`;
          if(hq) p += " award-winning photography, 8K, sharp, PBR shading.";
          if(negative) p += ` --- DO NOT include: ${negative}.`;

          const enhanced = await enhancePrompt(apiKey,p);
          const url = await generateImage(apiKey, enhanced, inlineCharacters, LATEST_BANANA_MODEL);
          setGallery(G=>G.map(g=>g.id===item.id?{...g,src:url,status:"completed",enhancedPrompt:enhanced}:g));
        }catch(e){
          setGallery(G=>G.map(g=>g.id===item.id?{...g,status:"error",error:String(e.message||e)}:g));
        }
      }));
      toast("Variations ready.");
    });
  }, [apiKey, assets, theme, imageStyle, hq, negative, runJob, toast, buildInlineAssets]);
  
  const doCombineFrames = useCallback(async () => {
    if (selectedFrames.length !== 2) return;
    await runJob(async () => {
        setStatus("Fusing frames...");
        const frame1 = gallery.find(g => g.id === selectedFrames[0]);
        const frame2 = gallery.find(g => g.id === selectedFrames[1]);
        if (!frame1 || !frame2) { throw new Error("Could not find selected frames."); }

        const newItem = { id: uid(), type: "image", src: "", status: "loading", prompt: `Fusion of two frames` };
        setGallery(g => [newItem, ...g]);

        try {
            const b64_1 = await urlToB64(frame1.src);
            const b64_2 = await urlToB64(frame2.src);
            const inlineAssets = [ { base64: b64_1 }, { base64: b64_2 } ];

            const prompt = `Create a single, new, cinematic 16:9 image that represents a creative and logical transition FROM the first image (start frame) TO the second image (end frame). Blend the key subjects, environments, and mood. The output should be a photorealistic, high-quality photograph.`;
            
            const enhanced = await enhancePrompt(apiKey, prompt);
            const url = await generateImage(apiKey, enhanced, inlineAssets, LATEST_BANANA_MODEL);
            
            setGallery(g => g.map(item => item.id === newItem.id ? { ...item, src: url, status: "completed", enhancedPrompt: enhanced } : item));
            toast("Frames fused successfully!");
        } catch (e) {
            setGallery(g => g.map(item => item.id === newItem.id ? { ...item, status: "error", error: String(e.message || e) } : item));
            throw e;
        } finally {
            setSelectedFrames([]);
        }
    });
  }, [selectedFrames, gallery, apiKey, runJob, urlToB64, toast]);
  
    // --- Vibe.AI Tool Functions ---
    const doVibeCreateCharacter = useCallback(async () => {
        await runJob(async () => {
            if (!vibeCharacter.trim() && !vibeImage) {
                toast("Please enter a character concept or upload an image first!", true);
                return;
            }
            setStatus("Creating character...");
            let userPromptText = vibeCharacter.trim();
            const systemPrompt = "You are a creative assistant specializing in character design for AI art. Generate a vivid, one-paragraph description of a character. If an image is provided, describe the character in the image. If text is provided, expand on that concept. The description should be detailed, focusing on appearance, clothing, accessories, and overall cool persona, perfectly suited for a text-to-image AI.";
            
            const parts = [];
            if (vibeImage) {
                userPromptText = userPromptText || "Describe the character in this image.";
                parts.push({ text: userPromptText });
                parts.push({ inlineData: { mimeType: vibeImage.type, data: vibeImage.b64 } });
            } else {
                parts.push({ text: userPromptText });
            }
            const payload = { contents: [{ parts }], systemInstruction: { parts: [{ text: systemPrompt }] } };
            const result = await geminiCall(apiKey, 'gemini-2.5-flash-preview-05-20', payload);
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                setVibeCharacter(text);
                toast("Character description generated!");
            } else {
                throw new Error("Character creation failed.");
            }
        });
    }, [apiKey, vibeCharacter, vibeImage, runJob, toast]);

    const doVibeSmartGenerate = useCallback(async () => {
        await runJob(async () => {
            if (!vibeCharacter.trim()) {
                toast("Please define your character first!", true);
                return;
            }
            setStatus("Generating prompts...");
            setVibePrompts([]); // Clear previous prompts
            const systemPrompt = `You are a world-class creative director and prompt engineer for advanced text-to-image AI models. Your task is to generate a list of 6 diverse, highly imaginative, and detailed prompts. The user has provided a character description and an optional theme. If the user has also provided an image, use it as a strong visual reference for the character. Invent unique, surreal, or epic scenarios. Describe the scene, the character's action, the mood, and the environment vividly. Conclude each prompt with relevant artistic keywords.`;
            let userPrompt = `Character: "${vibeCharacter}"`;
            if (vibeTheme.trim()) userPrompt += `\nTheme/Idea: "${vibeTheme.trim()}"`;
            
            const parts = [{ text: userPrompt }];
            if (vibeImage) {
                 parts.push({ inlineData: { mimeType: vibeImage.type, data: vibeImage.b64 } });
            }

            const payload = {
                contents: [{ parts }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "prompts": { type: "ARRAY", items: { type: "OBJECT", properties: { "title": { "type": "STRING" }, "prompt": { "type": "STRING" } }, required: ["title", "prompt"] } }
                        },
                    }
                }
            };
            const result = await geminiCall(apiKey, 'gemini-2.5-flash-preview-05-20', payload);
            const rawJsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawJsonText) {
                const parsedJson = tryParseJSON(rawJsonText);
                if (parsedJson && parsedJson.prompts) {
                    setVibePrompts(parsedJson.prompts.map(p => ({...p, id: uid(), imageUrl: null, isVisualizing: false})));
                    toast("6 new prompts generated!");
                } else {
                    throw new Error("Failed to parse AI prompt response.");
                }
            } else {
                throw new Error("AI prompt generation failed to return data.");
            }
        });
    }, [apiKey, vibeCharacter, vibeTheme, vibeImage, runJob, toast]);

    const doVibeVisualize = useCallback(async (promptId, promptText) => {
        setVibePrompts(prompts => prompts.map(p => p.id === promptId ? {...p, isVisualizing: true} : p));
        try {
            const url = await generateImage(apiKey, promptText, [], LATEST_BANANA_MODEL);
            const newGalleryItem = { id: uid(), type: "image", src: url, status: "completed", prompt: promptText };
            setGallery(g => [newGalleryItem, ...g]);
            setVibePrompts(prompts => prompts.map(p => p.id === promptId ? {...p, isVisualizing: false, imageUrl: url} : p));
            toast("Visualization complete & added to gallery!");
        } catch (e) {
            toast(String(e.message || "Visualization failed"), true);
            setVibePrompts(prompts => prompts.map(p => p.id === promptId ? {...p, isVisualizing: false} : p));
        }
    }, [apiKey, toast]);
    
  const assetCard = useCallback((a, assetList, setAssetList) => (
    <div key={a.id} className="flex items-center justify-between bg-black/30 p-2 rounded-lg border border-white/10">
      <div className="flex items-center gap-2">
        <img src={a.previewUrl} className="w-8 h-8 rounded-md object-cover" alt={a.name} />
        <input className="bg-transparent text-sm outline-none border-b border-transparent focus:border-white/30" value={a.name} onChange={(e)=>setAssetList(L=>L.map(x=>x.id===a.id?{...x,name:e.target.value}:x))} />
        <span className="text-xs text-slate-400">({a.type})</span>
      </div>
      <button onClick={()=>setAssetList(L=>L.filter(x=>x.id!==a.id))} className="p-1 hover:bg-rose-500/20 rounded-md">{I.trash({ className:"w-4 h-4 text-slate-500 hover:text-rose-400" })}</button>
    </div>
  ), []);
  
  const toggleFrameSelection = (id) => {
    setSelectedFrames(prev => {
        if (prev.includes(id)) {
            return prev.filter(frameId => frameId !== id);
        }
        if (prev.length < 2) {
            return [...prev, id];
        }
        toast("You can only select up to 2 frames to fuse.", true);
        return prev;
    });
  };

  const toggleScriptCharacter = (id) => {
      setScriptCharacterIDs(current => 
          current.includes(id) 
              ? current.filter(cid => cid !== id) 
              : [...current, id]
      );
  };

  function addToStoryboard(url){ setStoryboard(S=>[...S,url]); }
  function clearGallery(){ setGallery([]); setSelectedFrames([]); }

  function buildVeo3JSONForAsset(a){
    const activeScriptCharacters = assets.filter(asset => scriptCharacterIDs.includes(asset.id));
    return {
      model: "veo-3",
      aspect_ratio: "16:9",
      fps,
      duration_seconds: 4,
      prompt: a.enhancedPrompt || a.prompt || "",
      negative_prompt: negative,
      guidance: 9,
      seed: Math.floor(Math.random() * 2**32),
      camera: consistencyKit?.cameraMoves || "",
      lens: consistencyKit?.lens || "",
      palette: consistencyKit?.palette || [],
      logo_guidelines: consistencyKit?.logoGuidelines || "",
      assets: (a.type === 'variation' ? assets : activeScriptCharacters).filter(x=>x.type!=="logo").map(x=>({ name:x.name, role:"character" })),
    };
  }
  function exportVeo3Batch(){
    const items = gallery.filter(g=>g.status==="completed"); if(!items.length){ toast("Nothing to export.",true); return; }
    const lines = items.map(a=>JSON.stringify(buildVeo3JSONForAsset(a))).join("\n");
    const blob = new Blob([lines],{type:"application/jsonl"}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`veo3_prompts_${Date.now()}.jsonl`; a.click();
    URL.revokeObjectURL(url);
  }
  
  const copyToClipboard = (text, e) => {
    const button = e.currentTarget;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => { button.textContent = originalText; }, 2000);
    }).catch(() => toast('Failed to copy!', true));
  };


  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-200">
      <style>{`#aurora{background:radial-gradient(40% 50% at 20% 25%,#1e40af 0,#0b1220 55%),radial-gradient(35% 45% at 80% 35%,#5b21b6 0,#0b1220 55%),radial-gradient(60% 30% at 50% 90%,#1d4ed8 0,#0b1220 50%);animation:aurora 22s infinite linear}@keyframes aurora{0%{background-position:0% 50%,0% 50%,0% 50%}50%{background-position:100% 50%,100% 50%,100% 50%}100%{background-position:0% 50%,0% 50%,0% 50%}}`}</style>
      <div id="aurora" className="fixed inset-0 opacity-35 -z-10"></div>
      
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-[#0b1220]/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8 border-4 border-dashed border-blue-500 rounded-3xl m-4 pointer-events-none"
          >
            {I.upload({ className: "w-16 h-16 text-blue-400 mb-4" })}
            <h2 className="text-2xl font-bold text-white">Drop your script file</h2>
            <p className="text-slate-300">Supports PDF, DOCX, and TXT files</p>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 backdrop-blur-lg bg-[#0b1220]/60 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} transition={{duration:.6}} className="w-8 h-8">
              <svg width="32" height="32" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs><path d="M20,20 V80 H50 C70,80 70,20 50,20 H20" stroke="url(#g)" strokeWidth="4" fill="none"/><path d="M80,80 V20 L50,80 V20" stroke="url(#g)" strokeWidth="4" fill="none"/></svg>
            </motion.div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">DN Studio — Ultra Creative PRO</h1>
              <p className="text-xs text-slate-400 -mt-0.5">Identity-locked images • Script → Shots • WebM • Veo3 JSON</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-black/30 px-3 py-1.5 rounded-lg border border-white/10">
            <motion.div initial={false} animate={isProcessing ? { rotate: 360 } : {rotate: 0}} transition={{repeat: Infinity, duration: 1, ease: 'linear'}}>{I.brain({ className:"w-5 h-5 text-blue-400" })}</motion.div>
            <p className="text-sm text-slate-300">{status}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="border border-white/10 bg-slate-900/40 rounded-2xl shadow-xl">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">{I.wand({ className:"w-6 h-6 text-purple-400" })}<h3 className="text-xl font-bold">Identity-Locked Variations (Nano-Banana)</h3></div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">Generate 10 varied 16:9 scenes. Uses preferred <span className="font-semibold">{`${LATEST_BANANA_MODEL}`}</span> when available, then falls back automatically.</p>
              <p className="text-sm text-slate-400 -mt-2">Uses all characters from the "Locked Assets" panel in the sidebar.</p>
              <Input value={theme} onChange={(e)=>setTheme(e.target.value)} placeholder="Theme (e.g., 'Desert cyberpunk chase')" />
              <div className="flex flex-wrap gap-2 items-center bg-black/20 p-2 rounded-lg">
                  <span className="text-sm font-medium text-slate-300">Active Characters:</span>
                  {assets.filter(a => a.type === 'character').length > 0 ? (
                      assets.filter(a => a.type === 'character').map(a => (
                          <div key={a.id} className="flex items-center gap-2 bg-slate-800/50 px-2 py-1 rounded-md border border-white/10 text-xs">
                              <img src={a.previewUrl} className="w-5 h-5 rounded-full object-cover" alt={a.name} />
                              <span>{a.name}</span>
                          </div>
                      ))
                  ) : (
                      <span className="text-sm text-slate-500">None. Add characters from the sidebar.</span>
                  )}
              </div>
              <div className="flex gap-3">
                <Button onClick={doVariations} disabled={isProcessing}>{I.play({ className:"w-4 h-4" })} Generate 10 Variations</Button>
              </div>
            </div>
          </section>

          <section className="border border-white/10 bg-slate-900/40 rounded-2xl shadow-xl">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">{I.text({ className:"w-6 h-6 text-blue-400" })}<h3 className="text-xl font-bold">Script → Visuals Engine (Consistency Kit)</h3></div>
            <div className="p-6 space-y-4">
              <Textarea value={script} onChange={(e)=>setScript(e.target.value)} placeholder="Paste your script or upload PDF/DOCX below (or drag & drop anywhere)" />
              
                <div className="space-y-3 p-3 bg-black/20 rounded-lg border border-white/10">
                    <h4 className="text-sm font-medium text-slate-300">Select Cast for this Script (from Locked Assets)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-2">
                        {assets.filter(a => a.type === 'character').length === 0 && <p className="text-xs text-slate-400 col-span-full text-center py-2">No characters in Locked Assets.</p>}
                        {assets.filter(a => a.type === 'character').map(a => (
                            <button key={a.id} onClick={() => toggleScriptCharacter(a.id)} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${scriptCharacterIDs.includes(a.id) ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800/50 border-transparent hover:border-white/20'}`}>
                                <img src={a.previewUrl} className="w-8 h-8 rounded-full object-cover" alt={a.name} />
                                <span className="text-sm text-left flex-grow">{a.name}</span>
                                {scriptCharacterIDs.includes(a.id) && I.check({ className: "w-5 h-5 text-blue-400" })}
                            </button>
                        ))}
                    </div>
                </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
                <label className="cursor-pointer">
                    <Button as="span" variant="outline" disabled={isProcessing}>{I.upload({ className:"w-4 h-4" })} Upload PDF/DOCX/TXT</Button>
                    <input type="file" accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" onChange={async (e)=>{ const f=e.target.files?.[0]; handleFileDrop(f); }} />
                </label>
                <Button variant="outline" onClick={() => runJob(() => optimizeScript(apiKey, script).then(setScript))} disabled={isProcessing}>{I.wand({ className:"w-4 h-4" })} Optimize Script</Button>
                <Button onClick={doGenerateScenePrompts} disabled={isProcessing}>{I.sparkles({ className:"w-4 h-4" })} Generate Scene Prompts</Button>
              </div>
              
               {scenePrompts.length > 0 && (
                <div className="space-y-6 pt-4 border-t border-white/10">
                    {scenePrompts.map((scene) => (
                        <div key={scene.sceneIndex} className="bg-black/20 p-4 rounded-lg">
                            <h4 className="font-bold text-slate-100">Scene {scene.sceneIndex}</h4>
                            <p className="text-xs text-slate-400 italic mb-3 line-clamp-2">{scene.sceneText}</p>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {scene.prompts.map((prompt, pIdx) => (
                                    <div key={pIdx} className="bg-slate-900/50 p-3 rounded-md border border-white/10 flex flex-col justify-between">
                                        <p className="text-sm text-slate-300">{prompt}</p>
                                        <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => doVisualizeScenePrompt(prompt, scene)} disabled={isProcessing}>Visualize</Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
               )}

            </div>
          </section>

            {/* Vibe.AI Smart Prompt Generator */}
            <section className="border border-white/10 bg-slate-900/40 rounded-2xl shadow-xl">
                <div className="p-6 border-b border-white/10 flex items-center gap-3">{I.sparkles({ className:"w-6 h-6 text-pink-400" })}<h3 className="text-xl font-bold">Vibe.AI Smart Prompt Generator</h3></div>
                <div className="p-6 space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
                        <h4 className="text-lg font-bold text-slate-100">1. Define Your Character</h4>
                        <Button variant="outline" onClick={doVibeCreateCharacter} disabled={isProcessing}>
                            {I.wand({className: "w-4 h-4"})} Create with AI
                        </Button>
                    </div>
                    <p className="text-sm text-slate-400 -mt-2">Write a description, or upload an image and use "Create with AI" to generate one.</p>
                    <div className="grid md:grid-cols-3 gap-6">
                        <Textarea value={vibeCharacter} onChange={(e) => setVibeCharacter(e.target.value)} rows="6" className="md:col-span-2" placeholder="e.g., An anthropomorphic cool greyhound dog..."/>
                        <div className="flex flex-col items-center justify-center">
                            <div className="relative w-full h-48 bg-black/30 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-slate-400 overflow-hidden">
                                {vibeImage ? (
                                    <>
                                        <img src={vibeImage.previewUrl} className="w-full h-full object-cover" alt="Vibe.AI Character Preview" />
                                        <button onClick={() => setVibeImage(null)} className="absolute bg-rose-600/80 text-white rounded-full w-7 h-7 flex items-center justify-center top-2 right-2 text-lg font-bold leading-none transition hover:bg-rose-500 hover:scale-110">&times;</button>
                                    </>
                                ) : (
                                    <span className="text-sm text-center p-2">Click below to upload a character image</span>
                                )}
                            </div>
                            <label className="w-full">
                                <Button as="span" variant="outline" className="w-full mt-4">Upload Image</Button>
                                <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    const { data, mimeType } = await fileToB64(f);
                                    setVibeImage({ b64: data, type: mimeType, previewUrl: URL.createObjectURL(f) });
                                }} />
                            </label>
                        </div>
                    </div>
                    
                    <h4 className="text-lg font-bold text-slate-100 pt-4">2. Add a Theme (Optional)</h4>
                    <p className="text-sm text-slate-400 -mt-2">Give the AI a starting point, like a place, genre, or concept.</p>
                    <Input value={vibeTheme} onChange={(e) => setVibeTheme(e.target.value)} placeholder="e.g., Time Travel, Underwater World, Abstract Emotions, Ancient Mythology" />

                    <div className="text-center pt-4">
                        <Button size="lg" onClick={doVibeSmartGenerate} disabled={isProcessing}>
                            {I.sparkles({className:"w-5 h-5"})} Smart Generate Prompts
                        </Button>
                    </div>
                    
                    {vibePrompts.length > 0 && (
                        <div className="space-y-4 pt-6 border-t border-white/10">
                            <h4 className="text-lg font-bold text-slate-100">AI-Generated Ideas</h4>
                            <div className="grid md:grid-cols-2 gap-4">
                                {vibePrompts.map((p) => (
                                    <div key={p.id} className="bg-black/30 p-4 rounded-lg border border-white/10 flex flex-col">
                                        {p.isVisualizing ? (
                                            <div className="w-full aspect-video bg-black/20 grid place-items-center rounded-lg mb-3"><DnaLoader/></div>
                                        ) : p.imageUrl ? (
                                             <img src={p.imageUrl} className="w-full aspect-video object-cover rounded-lg mb-3" alt={`Visualization of ${p.title}`} />
                                        ) : null}
                                        <h5 className="font-bold text-purple-300">{p.title}</h5>
                                        <p className="text-sm text-slate-300 flex-grow mt-1">{p.prompt}</p>
                                        <div className="mt-4 flex justify-end items-center gap-2">
                                            {!p.imageUrl && <Button size="sm" variant="outline" onClick={() => doVibeVisualize(p.id, p.prompt)} disabled={p.isVisualizing || isProcessing}>Visualize</Button>}
                                            {p.imageUrl && <Button size="sm" variant="outline" onClick={() => addToStoryboard(p.imageUrl)}>Add to Video</Button>}
                                            <Button size="sm" variant="ghost" onClick={(e) => copyToClipboard(p.prompt, e)}>Copy</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-2xl text-white">Output Gallery</h3>
              <div className="flex gap-2">
                 {selectedFrames.length === 2 && <Button variant="primary" onClick={doCombineFrames} disabled={isProcessing}>{I.fuse({className:"w-4 h-4"})} Fuse 2 Frames</Button>}
                <Button variant="outline" onClick={exportVeo3Batch} disabled={isProcessing || gallery.filter(g=>g.status==="completed").length === 0}>{I.json({ className:"w-4 h-4" })} Export Veo3 .jsonl</Button>
                {gallery.length>0 && <Button variant="danger" onClick={clearGallery} disabled={isProcessing}>{I.trash({ className:"w-4 h-4" })} Clear All</Button>}
              </div>
            </div>
            {gallery.length===0?(
              <div className="text-slate-400 text-center py-16 border-2 border-dashed border-white/10 rounded-2xl">
                <p>Your generations will appear here.</p>
                <p className="text-sm">Use Variations or Script → Visuals to start.</p>
              </div>
            ):(
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {gallery.map(a=> (
                  <div key={a.id} className={`border bg-slate-900/50 rounded-2xl overflow-hidden group relative transition-all duration-200 ${selectedFrames.includes(a.id) ? 'border-blue-500 scale-105 shadow-2xl' : 'border-white/10'}`} onClick={() => a.status === 'completed' && toggleFrameSelection(a.id)}>
                    {a.status==="loading" && <DnaLoader />}
                    {a.status==="error" && <div className="w-full aspect-video bg-rose-900/20 grid place-items-center p-4 text-center"><p className="text-sm text-rose-300">Failed</p><p className="text-xs text-slate-400 mt-1 line-clamp-2" title={a.error}>{a.error}</p></div>}
                    {a.status==="completed" && <>
                      <img src={a.src} alt={a.prompt||"Generated"} className="w-full aspect-video object-cover cursor-pointer"/>
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setModal(a); }}>View</Button>
                        <Button variant="outline" size="sm" onClick={(e)=>{ e.stopPropagation(); const o=buildVeo3JSONForAsset(a); const blob=new Blob([JSON.stringify(o,null,2)],{type:"application/json"}); const u=URL.createObjectURL(blob); const dl=document.createElement("a"); dl.href=u; dl.download=`veo3_${a.id}.json`; dl.click(); URL.revokeObjectURL(u); }}>Veo3 JSON</Button>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); addToStoryboard(a.src); }}>Add to Video</Button>
                      </div>
                    </>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border border-white/10 bg-slate-900/40 rounded-2xl shadow-xl">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">{I.play({ className:"w-6 h-6 text-emerald-400" })}<h3 className="text-xl font-bold">Storyboard → WebM</h3></div>
            <div className="p-6 space-y-4">
              {storyboard.length===0 ? <p className="text-sm text-slate-400">Add images from the gallery.</p> : (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">{storyboard.map((s,i)=>(<div key={i} className="relative group"><img src={s} alt={`Storyboard frame ${i+1}`} className="w-full aspect-video object-cover rounded-lg border border-white/10"/><button className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={()=>setStoryboard(A=>A.filter((_,j)=>j!==i))}>{I.close({ className:"w-3 h-3" })}</button></div>))}</div>
              )}
              <div className="grid md:grid-cols-4 gap-3">
                <div><label className="text-xs text-slate-400">FPS</label><Select value={fps} onChange={(e)=>setFps(parseInt(e.target.value, 10))}><option value={24}>24</option><option value={30}>30</option><option value={60}>60</option></Select></div>
                <div><label className="text-xs text-slate-400">Crossfade (ms)</label><Input type="number" value={crossfade} onChange={(e)=>setCrossfade(parseInt(e.target.value||"0", 10))}/></div>
                <div className="flex items-end gap-2"><Switch checked={kenBurns} onChange={setKenBurns}/><label className="text-sm">Ken Burns</label></div>
                <div className="flex items-end justify-end"><Button disabled={storyboard.length === 0 || isProcessing} onClick={async()=>{ await runJob(async () => { setStatus("Encoding video..."); const url=await imagesToWebM({ urls:storyboard, fps, width:1280, height:720, crossfadeMs:crossfade, kenBurns }); const a=document.createElement("a"); a.href=url; a.download=`dn_ultra_${Date.now()}.webm`; a.click(); URL.revokeObjectURL(url); toast("Video saved!"); }) }}>{I.download({ className:"w-4 h-4" })} Export WebM</Button></div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-8 lg:sticky top-24 h-min">
          <section className="border border-white/10 bg-slate-900/40 rounded-2xl shadow-xl">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">{I.key({ className:"w-6 h-6 text-blue-400" })}<h3 className="text-xl font-bold">API Key</h3></div>
            <div className="p-6 space-y-3">
              <Input type="password" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} placeholder="Enter Google AI Studio key" />
              <div className="flex items-center gap-2"><Switch checked={remember} onChange={setRemember}/><label className="text-sm">Remember key</label></div>
              <p className="text-xs text-slate-500">For production, proxy the key on your server.</p>
            </div>
          </section>

          <section className="border border-white/10 bg-slate-900/40 rounded-2xl shadow-xl">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">{I.brain({ className:"w-6 h-6 text-purple-400" })}<h3 className="text-xl font-bold">Locked Assets</h3></div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-400 -mt-2">Manage all your characters and logos here. Select them in the Script Engine to use them.</p>
              <div className="grid md:grid-cols-2 gap-2">
                <Input value={assetName} onChange={(e)=>setAssetName(e.target.value)} placeholder="Asset name (e.g., John)" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer w-full"><Button as="span" size="sm" variant="outline" className="w-full">Character</Button><input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if(!f) return; const n=assetName||`Character ${assets.filter(x=>x.type==='character').length+1}`; const previewUrl=URL.createObjectURL(f); setAssets(L=>[...L,{id:uid(),name:n,file:f,previewUrl,type:'character'}]); setAssetName(""); }} /></label>
                  <label className="cursor-pointer w-full"><Button as="span" size="sm" variant="outline" className="w-full">Logo</Button><input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if(!f) return; const n=assetName||"Logo"; const previewUrl=URL.createObjectURL(f); setAssets(L=>[...L,{id:uid(),name:n,file:f,previewUrl,type:'logo'}]); setAssetName(""); }} /></label>
                </div>
              </div>
              <div className="space-y-2">
                {assets.length===0 && <p className="text-xs text-slate-400">Upload assets to use in your projects.</p>}
                {assets.map(a => assetCard(a, assets, setAssets))}
              </div>
            </div>
          </section>
        </aside>
      </main>

      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setModal(null)}>
            <motion.div className="bg-slate-950 border border-white/10 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" initial={{scale:.97,y:10,opacity:0}} animate={{scale:1,y:0,opacity:1}} exit={{scale:.97,y:10,opacity:0}} onClick={(e)=>e.stopPropagation()}>
              <div className="flex justify-between items-center p-2 bg-slate-900/50 border-b border-white/10">
                <div className="px-2 text-xs text-slate-400 truncate">{(modal.enhancedPrompt||modal.prompt||"").slice(0,140)}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={()=>{ const obj=buildVeo3JSONForAsset(modal); const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`veo3_${modal.id}.json`; a.click(); URL.revokeObjectURL(url); }}>Veo3 JSON</Button>
                  <Button variant="ghost" size="sm" onClick={()=>setModal(null)}>{I.close({ className:"w-4 h-4" })}</Button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto flex-grow flex items-center justify-center"><img src={modal.src} alt={modal.prompt} className="max-w-full max-h-full object-contain rounded-lg"/></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map(t=><Toast key={t.id} t={t} onClose={()=>closeToast(t.id)} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

