import type { scenarioType, ResponseBody, PreparedPark } from '../server/web.js';

// Function to download data to a file (https://stackoverflow.com/a/30832210/11210376)
function download(data: Uint8Array<ArrayBuffer>, filename: string, type: string) {
    const file = new Blob([data], { type: type });
    var a = document.createElement("a"),
        url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

type processStatus = 'disabled' | 'loading' | 'ready' | 'error';
interface FileObjects {
    data: Uint8Array<ArrayBuffer>;
    filename: string;
}

document.addEventListener("DOMContentLoaded", function () {
    const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    const fundInput = document.getElementById('fundInput') as HTMLInputElement;
    const tilebuttons: Record<scenarioType, HTMLButtonElement> = {
        sandbox: document.getElementById('sandboxbtn') as HTMLButtonElement,
        economy: document.getElementById('economybtn') as HTMLButtonElement
    };
    if ([uploadBtn, fileInput, fundInput, tilebuttons.sandbox, tilebuttons.economy].some(el => !el)) {
        console.log('some elements not found on page');
        return;
    }
    const statuses: processStatus[] = [
        'disabled',
        'loading',
        'ready',
        'error'
    ];
    const fileobjs: Record<scenarioType, Partial<FileObjects>> = {
        sandbox: {},
        economy: {}
    };

    const resetFile = function () {
        try {
            fileInput.value = '';
            if (fileInput.value) {
                fileInput.type = "text";
                fileInput.type = "file";
            }
        }
        finally {
            fileInput.disabled = false;
        }
    };


    function updateTiles(status: processStatus, filter?: scenarioType) {
        for (let key in tilebuttons) {
            if (filter && key !== filter) {
                continue;
            }
            const btn = tilebuttons[key as keyof typeof tilebuttons];
            btn.disabled = status !== 'ready';
            btn.classList.remove(...statuses);
            btn.classList.add(status);
        }
    }

    function downloadPark(mode: scenarioType) {
        const fobj = fileobjs[mode];
        if (!fobj.data || !fobj.filename) {
            return;
        }
        download(fobj.data, fobj.filename, 'application/octet-stream');
    }

    uploadBtn.addEventListener('click', async _e => {
        const file = fileInput.files?.[0];
        if (!file) {
            return;
        }
        const body = new FormData();
        body.append('park', file);
        body.append('funds', fundInput.value);
        resetFile();
        updateTiles('loading');
        const response = await fetch('/upload', {
            method: 'POST',
            headers: {
            },
            body
        });
        const data = await response.json() as ResponseBody;
        if (data.status === 'nice') {
            const evtSource = new EventSource(`/results/${data.id}`);
            evtSource.addEventListener('message', message => {
                const parkFile = JSON.parse(message.data) as PreparedPark;
                fileobjs[parkFile.mode] = {
                    filename: parkFile.filename,
                    data: Uint8Array.from(atob(parkFile.data), c => c.charCodeAt(0))
                };
                updateTiles('ready', parkFile.mode);
            });
        }
        else {
            updateTiles('error');
        }
    });

    for (let key in tilebuttons) {
        const btn = tilebuttons[key as keyof typeof tilebuttons];
        btn.addEventListener('click', _ => {
            if (!btn.disabled) {
                downloadPark(key as scenarioType);
            }
        });
    }
    resetFile();
    updateTiles('disabled');
});
