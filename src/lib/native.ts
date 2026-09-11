import { Capacitor } from '@capacitor/core'

/** True inside the iOS (or Android) shell, false in every browser. Web behaviour never branches on this except to hand a job to the device. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform()
