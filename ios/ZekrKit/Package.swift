// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ZekrKit",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "ZekrKit", targets: ["ZekrKit"])],
    targets: [
        // Apple platforms ship SQLite as the `SQLite3` module; on Linux (CI, tests) we link the system library.
        .systemLibrary(name: "CSQLite", path: "Sources/CSQLite"),
        .target(
            name: "ZekrKit",
            dependencies: [.target(name: "CSQLite", condition: .when(platforms: [.linux]))]
        ),
        .testTarget(name: "ZekrKitTests", dependencies: ["ZekrKit"]),
    ]
)
