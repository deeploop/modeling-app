# GLB Viewer Implementation Plan

## 📋 Files to Modify/Create

### 🆕 New Files to Create (4 files)

#### 1. **GLB Viewer Component**
**File:** `src/components/GlbViewer/GlbViewerComponent.tsx`
**Purpose:** Main React component for GLB viewer with pan, zoom, rotate controls
**Size:** ~300-400 lines
**Features:**
- Three.js scene setup
- GLTFLoader integration
- OrbitControls for mouse interaction
- File upload/drag-drop support
- Toolbar with control buttons

#### 2. **GLB Viewer Controls**
**File:** `src/components/GlbViewer/GlbViewerControls.ts`
**Purpose:** Camera controls specifically for GLB viewer
**Size:** ~200-300 lines
**Features:**
- Pan (left/right drag)
- Zoom (scroll wheel)
- Rotate (right-click drag)
- Reset view button
- Fit to view

#### 3. **GLB Viewer Pane**
**File:** `src/components/layout/areas/GlbViewerPane.tsx`
**Purpose:** Layout system integration wrapper
**Size:** ~50-100 lines
**Features:**
- Wraps GlbViewerComponent
- Integrates with layout system
- Handles pane lifecycle

#### 4. **GLB Viewer Utilities**
**File:** `src/components/GlbViewer/glbViewerUtils.ts`
**Purpose:** Helper functions for GLB viewer
**Size:** ~100-150 lines
**Features:**
- File validation
- Model centering
- Bounding box calculation
- Material setup

---

### ✏️ Existing Files to Modify (3 files)

#### 1. **Layout Types**
**File:** `src/lib/layout/types.ts`
**Lines to modify:** ~2-3 lines
**Changes:**
```typescript
export enum AreaType {
  TTC = 'ttc',
  Code = 'codeEditor',
  FeatureTree = 'featureTree',
  Files = 'files',
  Variables = 'variables',
  Logs = 'logs',
  ModelingScene = 'modeling',
  Debug = 'debug',
  GlbViewer = 'glbViewer',  // ✅ ADD THIS
}
```

#### 2. **Default Area Library**
**File:** `src/lib/layout/defaultAreaLibrary.tsx`
**Lines to modify:** ~10-15 lines
**Changes:**
```typescript
import { GlbViewerPane } from '@src/components/layout/areas/GlbViewerPane' // ✅ ADD

export const defaultAreaLibrary = Object.freeze({
  // ... existing areas ...
  glbViewer: {  // ✅ ADD THIS BLOCK
    hide: () => false,
    shortcut: 'Shift + G',
    Component: GlbViewerPane,
  },
  // ... rest of areas ...
})
```

#### 3. **Default Layout Config** (Optional)
**File:** `src/lib/layout/configs/default.ts`
**Lines to modify:** ~5-10 lines (if you want it in default layout)
**Changes:** Add GLB viewer pane to default layout structure

---

## 📊 Summary

| Type | Count | Total Lines |
|------|-------|-------------|
| **New Files** | 4 | ~700-1000 |
| **Modified Files** | 3 | ~20-30 |
| **Total Files** | **7** | **~720-1030** |

---

## 🎯 Implementation Steps

### Step 1: Create Core Component (File 1)
```typescript
// src/components/GlbViewer/GlbViewerComponent.tsx
- Setup Three.js scene
- Add GLTFLoader
- Implement OrbitControls
- Add file upload UI
- Add control toolbar
```

### Step 2: Create Controls (File 2)
```typescript
// src/components/GlbViewer/GlbViewerControls.ts
- Camera manipulation methods
- Mouse event handlers
- Touch support
- Animation loop
```

### Step 3: Create Utilities (File 4)
```typescript
// src/components/GlbViewer/glbViewerUtils.ts
- File validation (.glb, .gltf)
- Model centering algorithm
- Lighting setup
- Material helpers
```

### Step 4: Create Layout Pane (File 3)
```typescript
// src/components/layout/areas/GlbViewerPane.tsx
- Wrapper for layout system
- Integrate GlbViewerComponent
- Handle pane props
```

### Step 5: Modify Types (Existing File 1)
```typescript
// src/lib/layout/types.ts
- Add GlbViewer to AreaType enum
```

### Step 6: Register in Library (Existing File 2)
```typescript
// src/lib/layout/defaultAreaLibrary.tsx
- Import GlbViewerPane
- Add glbViewer to library
- Set shortcut and config
```

### Step 7: Update Layout (Existing File 3, Optional)
```typescript
// src/lib/layout/configs/default.ts
- Add GLB viewer to default layout
```

---

## 🔧 Dependencies Needed

Already available in project:
- ✅ Three.js
- ✅ GLTFLoader
- ✅ React
- ✅ TypeScript

May need to install:
- OrbitControls (already in three/examples)
- DragControls (if needed)

---

## 🎨 Features to Implement

### Basic Features (MVP)
- ✅ Load .glb/.gltf files
- ✅ Orbit camera (rotate)
- ✅ Pan camera
- ✅ Zoom camera
- ✅ Reset view
- ✅ Fit to view

### Advanced Features (Optional)
- 🔲 Wireframe toggle
- 🔲 Grid toggle
- 🔲 Lighting controls
- 🔲 Animation playback (if model has animations)
- 🔲 Material editor
- 🔲 Screenshot capture
- 🔲 Model info display

---

## 📝 Minimal File Count

If you want the **absolute minimum**:

| Scenario | Files | Description |
|----------|-------|-------------|
| Minimum | **3 files** | 1 component + 2 modified files |
| Recommended | **5 files** | Component + Controls + Pane + 2 modified |
| Full Featured | **7 files** | All files above + utilities + layout config |

---

## 🚀 Quick Start Option

If you want to start quickly, I can create:
1. **One self-contained component** (~400 lines)
2. **Modify 2 existing files** (~15 lines total)

This would give you a working GLB viewer with basic pan/zoom/rotate in just **3 file changes**.

---

**Ready to proceed?** Let me know if you want:
- A) Full implementation (7 files)
- B) Recommended implementation (5 files)
- C) Minimal implementation (3 files)
