import ExpoModulesCore

/// Declared in `../expo-module.config.json`'s `apple.appDelegateSubscribers`,
/// so `ExpoAppDelegateSubscriberRepository` instantiates it once at app
/// startup and calls `subscriberDidRegister()` on it — per
/// `ExpoAppDelegateSubscriberProtocol`'s own doc comment, that runs "just
/// before the main code of the app", before any other `UIApplicationDelegate`
/// callback, and needs no `jsi::Runtime` to have been created yet, which is
/// exactly what registering a constructor in Nitro's `HybridObjectRegistry`
/// requires (see `JuicioNativeRegisterHybridObject`'s own comment).
///
/// This is the explicit registration entry point the plan calls for, in
/// place of a static initializer — see
/// `../cpp/JuicioNativeRegistration.hpp` for why a static initializer is
/// unsafe on this platform specifically.
public final class JuicioNativeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func subscriberDidRegister() {
    JuicioNativeRegisterHybridObject()
  }
}
