import Foundation
#if canImport(SQLite3)
import SQLite3
#else
import CSQLite
#endif

public enum DatabaseError: Error, CustomStringConvertible {
    case open(String)
    case query(String)

    public var description: String {
        switch self {
        case .open(let m): return "Could not open database: \(m)"
        case .query(let m): return "Database query failed: \(m)"
        }
    }
}

public enum Bind {
    case int(Int)
    case text(String)
}

/// One row of a query result. Columns are numbered from 0.
public struct Row {
    let statement: OpaquePointer

    public func int(_ column: Int32) -> Int { Int(sqlite3_column_int64(statement, column)) }

    public func text(_ column: Int32) -> String {
        guard let c = sqlite3_column_text(statement, column) else { return "" }
        return String(cString: c)
    }

    public func optionalText(_ column: Int32) -> String? {
        sqlite3_column_type(statement, column) == SQLITE_NULL ? nil : text(column)
    }
}

/// Minimal read-only SQLite wrapper for the bundled Quran databases.
public final class SQLiteDatabase {
    private var handle: OpaquePointer?

    public init(url: URL) throws {
        // immutable=1: the file is never written, so SQLite creates no journal files next to it (it lives in the app bundle).
        let uri = url.absoluteString + "?immutable=1"
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_URI | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(uri, &handle, flags, nil) == SQLITE_OK else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown error"
            sqlite3_close_v2(handle)
            throw DatabaseError.open("\(url.path): \(message)")
        }
    }

    deinit { sqlite3_close_v2(handle) }

    public func query<T>(_ sql: String, _ binds: [Bind] = [], map: (Row) throws -> T) throws -> [T] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let stmt = statement else {
            throw DatabaseError.query("\(String(cString: sqlite3_errmsg(handle))) in: \(sql)")
        }
        defer { sqlite3_finalize(stmt) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (i, bind) in binds.enumerated() {
            let index = Int32(i + 1)
            switch bind {
            case .int(let v): sqlite3_bind_int64(stmt, index, Int64(v))
            case .text(let v): sqlite3_bind_text(stmt, index, v, -1, transient)
            }
        }
        var rows: [T] = []
        while true {
            let step = sqlite3_step(stmt)
            if step == SQLITE_ROW {
                rows.append(try map(Row(statement: stmt)))
            } else if step == SQLITE_DONE {
                return rows
            } else {
                throw DatabaseError.query("\(String(cString: sqlite3_errmsg(handle))) in: \(sql)")
            }
        }
    }
}
