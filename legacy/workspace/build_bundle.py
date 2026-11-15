from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).parent
paths=sorted(p for p in root.rglob('*') if p.is_file() and p.suffix in {'.jsx','.js','.css','.mjs','.json','.md'} and p.name not in {'package-lock.json'} and p.name != 'build_bundle.py')
manifest=[]
for p in paths:
    rel=p.relative_to(root).as_posix()
    data=p.read_text(encoding='utf-8')
    manifest.append({'path':rel,'bytes':len(data.encode()),'sha256':hashlib.sha256(data.encode()).hexdigest()})
output=Path('/mnt/data/eduplan-v12-deployment-bundle.md')
with output.open('w',encoding='utf-8') as out:
    for p in paths:
        rel=p.relative_to(root).as_posix(); data=p.read_text(encoding='utf-8')
        out.write(f'===BEGIN_FILE:{rel}===\n{data}\n===END_FILE:{rel}===\n')
archive=Path('/mnt/data/eduplan-workspace-v1.2.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
    for p in paths:
        rel=p.relative_to(root).as_posix();z.write(p,rel)
print(json.dumps({'files':len(paths),'bundle':str(output),'bundle_bytes':output.stat().st_size,'zip':str(archive),'zip_bytes':archive.stat().st_size,'files_manifest':[m['path'] for m in manifest]},ensure_ascii=False))
