import './styles.css';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { ko } from './i18n/ko';
import { setPdfWorkerSrc } from './lib/outlineRead';
import { startApp } from './ui/app';

document.title = ko.appTitle;
document.documentElement.lang = 'ko';
setPdfWorkerSrc(workerUrl);
startApp(document.querySelector('#app') as HTMLElement);
