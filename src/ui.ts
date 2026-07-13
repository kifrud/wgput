import type { ParamConfig, ShaderParamsStore } from "./config";

export function checkWebGPUSupport(): boolean {
  if (!navigator.gpu) {
    const fallbackOverlay = document.getElementById("no-webgpu-overlay");
    if (fallbackOverlay) fallbackOverlay.classList.remove("hidden");
    return false;
  }
  return true;
}

export function initControlsPanel(store: any, paramConfigs: ParamConfig[]) {
  const controlsToggle = document.getElementById("controls-toggle");
  const controlsContent = document.getElementById("controls-content");
  const controlsChevron = document.getElementById("controls-chevron");

  if (controlsToggle && controlsContent && controlsChevron) {
    controlsToggle.addEventListener("click", () => {
      const isCollapsed = controlsContent.classList.contains("max-h-0");
      if (isCollapsed) {
        controlsContent.classList.remove("max-h-0", "opacity-0", "mt-0");
        controlsContent.classList.add("max-h-[1000px]", "opacity-100", "mt-4");
        controlsChevron.classList.remove("rotate-180");
      } else {
        controlsContent.classList.add("max-h-0", "opacity-0", "mt-0");
        controlsContent.classList.remove(
          "max-h-[1000px]",
          "opacity-100",
          "mt-4",
        );
        controlsChevron.classList.add("rotate-180");
      }
    });
  }

  if (controlsContent) {
    paramConfigs.forEach((cfg) => {
      const wrapper = document.createElement("div");
      wrapper.className = "control-group";

      const label = document.createElement("label");
      label.className = "control-header select-none cursor-pointer";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = cfg.name;

      const valueSpan = document.createElement("span");
      valueSpan.textContent = store[cfg.name].toString();

      label.appendChild(nameSpan);
      label.appendChild(valueSpan);

      const input = document.createElement("input");
      input.type = "range";
      input.min = cfg.min.toString();
      input.max = cfg.max.toString();
      input.step = cfg.step.toString();
      input.value = store[cfg.name].toString();

      input.addEventListener("input", (e: Event) => {
        store[cfg.name] = parseFloat((e.target as HTMLInputElement).value);
      });

      const resetToDefault = () => {
        store[cfg.name] = cfg.defaultValue;
        input.value = cfg.defaultValue.toString();
      };

      input.addEventListener("dblclick", resetToDefault);
      label.addEventListener("dblclick", resetToDefault);

      store.$subscribe((prop: keyof ShaderParamsStore, value: any) => {
        if (prop === cfg.name) {
          valueSpan.textContent = value.toString();
        }
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      controlsContent.appendChild(wrapper);
    });
  }
}
