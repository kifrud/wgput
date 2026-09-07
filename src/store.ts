interface ISource<T extends Store> {
  static: Partial<T>
  computed: { [K in keyof T]?: (deps: T) => T[K] }
  cache: Partial<T>
  deps: Partial<Record<keyof T, Set<keyof T>>>
  rdeps: Partial<Record<keyof T, Set<keyof T>>>
}

type Store = Record<string, unknown>

export type ReactiveStore<T extends Store> = T & {
  $subscribe: (
    listener: (property: keyof T, value: T[keyof T]) => void,
  ) => () => void
}

export const createStore = <T extends Store>() => {
  const listeners = new Set<(property: string, value: any) => void>()

  const source = {
    static: {},
    computed: {},
    cache: {},
    deps: {},
    rdeps: {},
  } satisfies ISource<T>

  const storeProxy = new Proxy(source as ISource<T>, {
    get(target, prop, receiver) {
      if (prop === '$subscribe') {
        return (listener: (p: keyof T, v: T[keyof T]) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }
      }
      if (typeof prop !== 'string') return undefined
      const property = prop as keyof T & string

      if (Object.hasOwn(target.static, property)) {
        return target.static[property]
      }
      if (Object.hasOwn(target.cache, property)) {
        return target.cache[property]
      }
      const computedFn = target.computed[property]
      if (computedFn) {
        target.rdeps[property]?.forEach((dep) => {
          target.deps[dep]?.delete(property)
        })

        const tracker = new Set<keyof T>()
        const depsTracker = new Proxy(receiver as T, {
          get(depTarget, depProp) {
            if (typeof depProp === 'string') tracker.add(depProp as keyof T)
            return depTarget[depProp as keyof T]
          },
        })

        const output = computedFn(depsTracker)
        target.cache[property] = output
        target.rdeps[property] = tracker

        tracker.forEach((dependency) => {
          target.deps[dependency] ??= new Set()
          target.deps[dependency]!.add(property)
        })

        return output
      }
      return undefined
    },

    set(target, prop, value, receiver) {
      if (typeof prop !== 'string') return Reflect.set(target, prop, value)
      const property = prop as keyof T & string
      const typedValue = value as T[keyof T] | ((deps: T) => T[keyof T])

      const oldValue = Object.hasOwn(target.static, property)
        ? target.static[property]
        : target.computed[property]
      if (oldValue === typedValue && typeof typedValue !== 'function') {
        return true
      }

      const affectedProps = new Set<keyof T>([property])
      const depClean = (prop: keyof T) => {
        target.deps[prop]?.forEach((dep) => {
          if (!affectedProps.has(dep)) {
            delete target.cache[dep]
            affectedProps.add(dep)
            depClean(dep)
          }
        })
      }
      depClean(property)

      if (typeof typedValue === 'function') {
        delete target.static[property]
        target.computed[property] = typedValue as unknown as (
          deps: T,
        ) => T[keyof T & string]
      } else {
        target.rdeps[property]?.forEach((dep) => {
          target.deps[dep]?.delete(property)
        })
        delete target.rdeps[property]
        delete target.computed[property]
        target.static[property] = typedValue as T[keyof T & string]
      }
      delete target.cache[property]

      affectedProps.forEach((prop) => {
        const newVal = (receiver as T)[prop]
        listeners.forEach((listener) =>
          listener(prop as string, newVal as T[keyof T]),
        )
      })

      return true
    },
  })

  return storeProxy as unknown as ReactiveStore<T>
}
