interface ISource {
  static: Record<string, any>;
  computed: Record<string, (deps: any) => any>;
  cache: Record<string, any>;
  deps: Record<string, Set<string>>;
}

type Store = Record<string, any>;

export const createStore = <T extends Store>() => {
  const listeners = new Set<(property: string, value: any) => void>();

  const source = {
    static: {},
    computed: {},
    cache: {},
    deps: {},
  } satisfies ISource;

  const storeProxy = new Proxy(source as ISource, {
    get(target, property: string, receiver) {
      // Expose the subscription mechanism on a special key
      if (property === "$subscribe") {
        return (listener: (prop: string, val: any) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener); // Unsubscribe function
        };
      }

      if (Object.hasOwn(target.static, property)) {
        return target.static[property];
      }
      if (Object.hasOwn(target.cache, property)) {
        return target.cache[property];
      }
      if (Object.hasOwn(target.computed, property)) {
        // TODO: change to Record<string, Ste<string>>
        for (const dep in target.deps) {
          target.deps[dep].delete(property);
        }

        const tracker = new Set<string>();
        const depsTracker = new Proxy(receiver, {
          get(depTarget, depProp: string) {
            tracker.add(depProp);
            return depTarget[depProp];
          },
        });

        const output = target.computed[property](depsTracker);
        target.cache[property] = output;

        tracker.forEach((dependency) => {
          target.deps[dependency] ??= new Set();
          target.deps[dependency].add(property);
        });

        return output;
      }
    },
    set(target, property: string, value, receiver) {
      const oldValue = Object.hasOwn(target.static, property)
        ? target.static[property]
        : target.computed[property];
      if (oldValue === value && typeof value !== "function") return true;

      const affectedProps = new Set<string>([property]);

      const depClean = (prop: string) => {
        target.deps[prop]?.forEach((dep: string) => {
          if (!affectedProps.has(dep)) {
            delete target.cache[dep];
            affectedProps.add(dep);
            depClean(dep);
          }
        });
      };

      depClean(property);

      if (typeof value === "function") {
        delete target.static[property];
        target.computed[property] = value;
      } else {
        delete target.computed[property];
        target.static[property] = value;
      }
      delete target.cache[property];

      affectedProps.forEach((prop) => {
        const newVal = receiver[prop];
        listeners.forEach((listener) => listener(prop, newVal));
      });

      return true;
    },
  });

  return storeProxy as unknown as T & {
    $subscribe: (
      listener: (property: keyof T, value: any) => void,
    ) => () => void;
  };
};
