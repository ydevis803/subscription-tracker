import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * iOS shell only: a browser "download" has nowhere to go inside the app, so the file is written to the app's
 * cache and handed to the iOS share sheet, where the user picks Calendar, Files, Mail and so on.
 * Returns false when the user dismissed the sheet without choosing anything.
 */
export async function shareTextFile(name: string, contents: string, title: string): Promise<boolean> {
  const { uri } = await Filesystem.writeFile({ path: name, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title, url: uri })
    return true
  } catch (e) {
    // The plugin rejects when the sheet is dismissed; that is not an error worth showing.
    if (e instanceof Error && /cancel/i.test(e.message)) return false
    throw e
  }
}
