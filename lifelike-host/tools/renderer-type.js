// Stands in for the engine module the GDK's material code asks: "is this WebGPU?"
// A website has no game engine, so the page says which renderer it picked.
let webGpu = false;
export const isWebGpuActive = () => webGpu;
export const setWebGpuActive = (value) => { webGpu = Boolean(value); };
