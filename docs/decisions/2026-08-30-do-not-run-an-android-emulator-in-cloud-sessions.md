---
status: accepted
---

# Do Not Run an Android Emulator in Cloud Sessions

A Claude Code cloud session was investigated as a place to run the Android
emulator, so a change could be exercised end to end without a physical
device. Three blockers were found, each observed separately, and none of
them is a configuration gap that a flag or a package closes.

`/dev/kvm` does not exist in the environment, and `/proc/cpuinfo` reports
neither `vmx` nor `svm` — there is no hardware virtualization to give the
emulator. An x86_64 system image refused to start against that host, with:

```
x86_64 emulation currently requires hardware acceleration!
```

An `arm64-v8a` system image was tried next, on the reasoning that it might
sidestep the missing acceleration. It refused for an unrelated reason
instead — an x86_64 host cannot run an arm64 guest under this emulator at
all:

```
Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on x86_64 host.
```

And even had either image started, this project's own Android build ships
`arm64-v8a` alone, so an x86_64 emulator could not have installed it anyway
— the two blockers above compound rather than offering a way around each
other.

Passing `-accel off` was tried as a way to force software emulation past the
missing acceleration. It got further: a TCG guest booted far enough to reach
`system_server`. It did not finish booting — `sys.boot_completed` never
became `1` across more than 19 minutes of wall clock, at which point the
attempt was abandoned as impractical rather than merely slow. Along the way,
installing the emulator package and one x86_64 system image cost a
significant part of the session's disk.

No combination of flags, ABI, or acceleration mode was found that boots an
emulator in this environment, so cloud sessions do not attempt one. A hosted
device cloud is the accepted alternative wherever end-to-end coverage needs a
running Android device or emulator: it supplies its own virtualization
infrastructure rather than depending on the cloud session's own.

The cost accepted here is that no cloud session can produce a
screen-by-screen, on-device run of an Android build. A build can still be
produced and its artifact inspected in a cloud session; running it lands on a
physical device, a locally-run emulator with hardware acceleration, or a
hosted device cloud, none of which are the cloud session itself.
