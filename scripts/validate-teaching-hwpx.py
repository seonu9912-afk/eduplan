"""Independent OWPML/package validation (dev only: python-hwpx==6.11.0)."""
import sys
from hwpx import HwpxDocument
from hwpx.tools.package_validator import validate_package
for path in sys.argv[1:]:
    document = HwpxDocument.open(path)
    schema = document.validate()
    package = validate_package(path)
    issues = list(schema.issues) + list(package.issues)
    if issues:
        raise SystemExit(f"{path}: {issues}")
    print(f"{path}: valid OWPML and package; {len(document.sections)} sections, {len(document.tables)} editable tables")
