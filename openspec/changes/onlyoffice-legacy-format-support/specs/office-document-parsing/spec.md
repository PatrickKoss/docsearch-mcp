## MODIFIED Requirements

### Requirement: Office file type classification

The system SHALL recognize DOCX (`.docx`), XLSX (`.xlsx`), PPTX (`.pptx`), DOC (`.doc`), XLS (`.xls`), and PPT (`.ppt`) file extensions and route them to the appropriate parser. Legacy formats (DOC, XLS, PPT) SHALL be routed through the OnlyOffice conversion pipeline before being processed by their modern format parsers.

#### Scenario: Mixed file types in FILE_ROOT

- **WHEN** a FILE_ROOT contains code, docs, PDFs, modern office files, and legacy office files
- **THEN** each file type is routed to its correct parser; legacy office files go through OnlyOffice conversion first, then to the matching modern parser

#### Scenario: Legacy file with OnlyOffice unconfigured

- **WHEN** a FILE_ROOT contains DOC/XLS/PPT files and `ONLYOFFICE_URL` is not set
- **THEN** legacy office files are skipped with a warning, while all other file types are processed normally
