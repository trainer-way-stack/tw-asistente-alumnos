// Extrae el texto de un PDF con PDFKit (nativo macOS; no necesita poppler).
// Uso: swift pdftext.swift <ruta.pdf> <salida.txt>
import PDFKit
import Foundation

let args = CommandLine.arguments
guard args.count > 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("ERR: no se pudo abrir el PDF\n".data(using: .utf8)!)
  exit(1)
}
let text = doc.string ?? ""
do {
  try text.write(toFile: args[2], atomically: true, encoding: .utf8)
  print("PAGES:\(doc.pageCount) CHARS:\(text.count)")
} catch {
  FileHandle.standardError.write("ERR: no se pudo escribir la salida\n".data(using: .utf8)!)
  exit(1)
}
