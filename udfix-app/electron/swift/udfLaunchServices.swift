import AppKit
import CoreServices
import Foundation
import UniformTypeIdentifiers

private let bundleId = "com.ofg.udfix"
private let customUti = "com.ofg.udfix.udf"
private let udfExtension = "udf"

private func allUdfContentTypeIds() -> [String] {
    var ids = Set<String>()
    ids.insert(customUti)

    for utType in UTType.types(tag: udfExtension, tagClass: .filenameExtension, conformingTo: nil) {
        ids.insert(utType.identifier)
    }

    if let preferred = UTType(filenameExtension: udfExtension) {
        ids.insert(preferred.identifier)
    }

    if let mime = UTType(mimeType: "application/x-uyap-udf") {
        ids.insert(mime.identifier)
    }

    return ids.filter { !$0.isEmpty }.sorted()
}

private func registerAppBundle() {
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else { return }
    LSRegisterURL(url as CFURL, true)
}

private func defaultBundleId(for uti: String) -> String? {
    guard
        let url = LSCopyDefaultApplicationURLForContentType(uti as CFString, LSRolesMask.all, nil)?
            .takeRetainedValue()
    else { return nil }
    return Bundle(url: url as URL)?.bundleIdentifier
}

private func setDefault(for uti: String, appURL: URL) -> Bool {
    if #available(macOS 12.0, *), let utType = UTType(uti) {
        do {
            try NSWorkspace.shared.setDefaultApplication(at: appURL, toOpen: utType)
            return true
        } catch {
            // Launch Services yolu ile dene
        }
    }
    return LSSetDefaultRoleHandlerForContentType(uti as CFString, LSRolesMask.all, bundleId as CFString) == noErr
}

private func runCheck() {
    let utis = allUdfContentTypeIds()
    if utis.isEmpty {
        print("none")
        exit(1)
    }

    var allMatch = true
    for uti in utis {
        let current = defaultBundleId(for: uti) ?? ""
        print("\(uti)=\(current)")
        if current != bundleId {
            allMatch = false
        }
    }
    print(allMatch ? "all" : "partial")
}

private func runSetDefault() {
    registerAppBundle()

    guard let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else {
        print("fail")
        exit(1)
    }

    let utis = allUdfContentTypeIds()
    if utis.isEmpty {
        print("none")
        exit(1)
    }

    var successCount = 0
    for uti in utis {
        if setDefault(for: uti, appURL: appURL) {
            successCount += 1
        }
    }

    if #available(macOS 12.0, *), let extType = UTType(filenameExtension: udfExtension) {
        do {
            try NSWorkspace.shared.setDefaultApplication(at: appURL, toOpen: extType)
            successCount += 1
        } catch {
            // noop
        }
    }

    registerAppBundle()

    var allMatch = true
    for uti in utis {
        if defaultBundleId(for: uti) != bundleId {
            allMatch = false
        }
    }

    if allMatch {
        print("ok")
        exit(0)
    }
    if successCount > 0 {
        print("partial")
        exit(0)
    }
    print("fail")
    exit(1)
}

private func runRegister() {
    registerAppBundle()
    print("ok")
}

switch CommandLine.arguments.dropFirst().first ?? "check" {
case "check":
    runCheck()
case "set-default":
    runSetDefault()
case "register":
    runRegister()
default:
    fputs("usage: udfLaunchServices.swift [check|set-default|register]\n", stderr)
    exit(2)
}
