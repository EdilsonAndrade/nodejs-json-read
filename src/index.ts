import path from 'path'
//import {markdown} from 'danger';
import fs from 'fs';

const file = '/size-snapshot.json';
interface SizeTracker{
    prev:number;
    current:number
}
export type BundlenAnalysis = {
  raw: SizeTracker;
  gzip: SizeTracker;
  brotli: SizeTracker;
};

interface IFileJson{
    field:BundlenAnalysis
}

enum Formatter{
    RAW  = "raw",
    GZIP = "gzip",
    BROTLI = "brotli"
  }
  
  interface ISummary {
    description:string;
  }

  enum FileStatus {
    KEPT = 'KEPT',
    DELETED = 'Deleted',
    NEWFILE = 'New File'
  }
  


function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const calculatePercentDelta = (values: SizeTracker) => {
  if (values.prev === 0 || values.current === 0) {
    return null;
  }
  if (values.prev - values.current > 0) {
    return Math.round(((values.prev / values.current - 1) * 10000) / 100);
  } else if (values.prev - values.current < 0) {
    return Math.round(((values.current / values.prev - 1) * 10000) / 100);
  }
  return null;
};

const getChange = (values: SizeTracker) => {
  const percent = calculatePercentDelta(values);
  const percentText = percent ? (percent > 0 ? '+' : '-').concat(`${percent}%`) : '';
  if (values.prev - values.current > 0) {
    return `\u25BC ${formatBytes(values.prev - values.current)} ${percentText}`;
  } else if (values.prev - values.current < 0) {
    return `\u25B2 ${formatBytes(values.current - values.prev)} ${percentText}`;
  }
  return '-';
};

const sanitizeFilePath = (path: string) => {
  return path.replace('*******', '').replace('*.', '').replace('bliss-apps/joy-web/', '');
};
const addedFiles: string[] = [];
const deletedFiles: string[] = [];
const significantChangeItems: string[] = [];
const criticalSizeItems: string[] = [];
const noChangeItems: string[] = [];

// prettier-ignore
const addSummaryRow = (snapShot: BundlenAnalysis, path: string) => {
  const summary = `| ${sanitizeFilePath(path)} | ${getChange(snapShot.raw)} | ${formatBytes(snapShot.raw.prev)} | ${formatBytes(snapShot.raw.current)} | ${getChange(snapShot.gzip)} | ${formatBytes(snapShot.gzip.prev)} | ${formatBytes(snapShot.gzip.current)} | ${getChange(snapShot.brotli)} | ${formatBytes(snapShot.brotli.prev)} | ${formatBytes(snapShot.brotli.current)} |`;
  const percentResult = calculatePercentDelta(snapShot.raw) || 0;
  if (percentResult > 2) {
    criticalSizeItems.push(summary)
  }else if(percentResult > 0.2){
    significantChangeItems.push(summary)
  }else{
    noChangeItems.push(summary)
  }
} 
  
const addDeletedOrAddRow = (status: FileStatus, snapShot: BundlenAnalysis, path: string) => {
  // prettier-ignore
  if (status === FileStatus.NEWFILE) {
    return `| ${sanitizeFilePath(path)} | ${status.toString()} | ${formatBytes(0)} | ${formatBytes(snapShot.raw.current)} | ${status.toString()} | ${formatBytes(0)} | ${formatBytes(snapShot.gzip.current)} | ${status.toString()} | ${formatBytes(0)} | ${formatBytes(snapShot.brotli.current)} |`;
  }
  // prettier-ignore
  return `| ${sanitizeFilePath(path)} | ${status.toString()} | ${formatBytes(snapShot.raw.prev)} | ${formatBytes(0)} | ${status.toString()}  | ${formatBytes(snapShot.gzip.prev)} | ${formatBytes(0)} | ${status.toString()}  | ${formatBytes(snapShot.brotli.prev)} | ${formatBytes(0)} |`;
};

(async function () {
    
const filePath = path.join(process.cwd(), 'size-snapshot.json')
const previousPath = path.join(process.cwd(), 'previous-snapshot.json')
const file = fs.readFileSync(filePath);
const fileParsed= JSON.parse(file.toString());
const previousFile = fs.readFileSync(previousPath);
const previousFileParsed = JSON.parse(previousFile.toString());

// Object.values(fileParsed).map(record => {
//     const fileSizes: ISnapshot = JSON.parse(JSON.stringify(record));
//      console.log(record)
// })
// Object.keys(fileParsed).map(record => {
//     const fileSizes: ISnapshot = JSON.parse(JSON.stringify(record));
//      console.log(record)
// })



const summaryCriticalSizeList: string[] = [];
const prevSnapshotPathSet = new Set(Object.keys(previousFileParsed));
const currSnapshotPathsSet = new Set(Object.keys(fileParsed));
const deriveFileChangeStatus = (path: string): FileStatus => {
  if (!currSnapshotPathsSet.has(path) && prevSnapshotPathSet.has(path)) {
    return FileStatus.DELETED;
  }
  if (!prevSnapshotPathSet.has(path) && currSnapshotPathsSet.has(path)) {
    return FileStatus.NEWFILE;
  }
  return FileStatus.KEPT;
};

(Object.entries(fileParsed) as Array<[string, BundlenAnalysis]>).forEach(([key, value]) => {
  const status = deriveFileChangeStatus(key);
  if (status === FileStatus.DELETED) {
    deletedFiles.push(addDeletedOrAddRow(status, value, key));
  } else if (status === FileStatus.NEWFILE) {
    addedFiles.push(addDeletedOrAddRow(status, value, key));
  } else {
    addSummaryRow(value, key);
  }
});

(Object.entries(previousFileParsed) as Array<[string, BundlenAnalysis]>).forEach(([key, value]) => {
  const status = deriveFileChangeStatus(key);
  if (status === FileStatus.DELETED) {
    deletedFiles.push(addDeletedOrAddRow(status, value, key));
  } else if (status === FileStatus.NEWFILE) {
    addedFiles.push(addDeletedOrAddRow(status, value, key));
  }
});
summaryCriticalSizeList.push(...addedFiles, ...deletedFiles, ...criticalSizeItems);
console.log(`

## Critical size changes
Change greater than 2%
  <details>
  <summary>Expand to show</summary>

  | File Path | +/- Raw | Base | Current | +/- Gzip | Base | Current | +/- Brotli | Base | Current |
  | ----------| :---| :--- | :----- | :---| :--- | :----- | :---| :--- | :----- |
  ${summaryCriticalSizeList.join('\n')}
  </details>
  
## Significant size changes
Change lesser than or equal to 2%
  <details>
  <summary>Expand to show</summary>

  | File Path | +/- Raw | Base | Current | +/- Gzip | Base | Current | +/- Brotli | Base | Current |
  | ----------| :---| :--- | :----- | :---| :--- | :----- | :---| :--- | :----- |
  ${significantChangeItems.join('\n')}
  </details>

## No changes
  <details>
  <summary>Expand to show</summary>

  | File Path | +/- Raw | Base | Current | +/- Gzip | Base | Current | +/- Brotli | Base | Current |
  | ----------| :---| :--- | :----- | :---| :--- | :----- | :---| :--- | :----- |
  ${noChangeItems.join('\n')}
  </details>
`)
})();
