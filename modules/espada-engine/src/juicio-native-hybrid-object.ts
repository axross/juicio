import type { HybridObject } from 'react-native-nitro-modules';

/**
 * The name `JuicioNativeHybridObject` (`../cpp/JuicioNativeHybridObject.hpp`)
 * is registered under, via `HybridObjectRegistry::registerHybridObjectConstructor`
 * (`../cpp/JuicioNativeRegistration.cpp`) — and the exact string this module
 * passes to `NitroModules.createHybridObject`. The two must match verbatim.
 */
export const JUICIO_NATIVE_HYBRID_OBJECT_NAME = 'JuicioNative';

/**
 * Mirrors `JuicioStatus` (`../cpp/juicio_native.h`) value for value: the
 * `status` argument `JuicioNativeHybridObject.start`'s `onSettled` callback
 * receives. Declared here, by hand, rather than generated or imported —
 * this project adopts no Nitrogen / `.nitro.ts` code generation (see the
 * plan behind issue #7), so this module is the one place that keeps this
 * numeric contract in sync with the C++ header across both languages.
 */
export const NativeJobStatus = {
  Success: 0,
  Cancelled: 1,
  Error: 2,
} as const;

/**
 * The hand-authored TypeScript shape of `JuicioNativeHybridObject`
 * (`../cpp/JuicioNativeHybridObject.hpp`). Every member here must be kept in
 * lockstep with that header's own public methods — see its comments for
 * what each parameter means; this interface restates none of that, only the
 * shape.
 */
export interface JuicioNativeHybridObject extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  start(
    limit: number,
    threadCount: number,
    onProgress: (progress: number) => void,
    onSettled: (status: number, result: number, message: string | undefined) => void,
  ): void;
  cancel(): void;
  release(): void;
}
