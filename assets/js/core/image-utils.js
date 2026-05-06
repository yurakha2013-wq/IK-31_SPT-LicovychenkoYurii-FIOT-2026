export function compressImage(file, maxW = 400, maxH = 400, quality = 0.75) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            reject(new Error("Не изображение"));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => compressBase64(e.target.result, maxW, maxH, quality).then(resolve).catch(reject);
        reader.onerror  = reject;
        reader.readAsDataURL(file);
    });
}

export function compressBase64(base64, maxW = 400, maxH = 400, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            if (w > maxW || h > maxH) {
                const ratio = Math.min(maxW / w, maxH / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Не вдалося підготувати зображення"));
                return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL("image/jpeg", quality);
            resolve(compressed);
        };
        img.onerror = () => reject(new Error("Не вдалося завантажити зображення"));
        img.src = base64;
    });
}

export function base64SizeKB(base64) {
    const len = base64.replace(/^data:.+;base64,/, "").length;
    return Math.round((len * 3 / 4) / 1024);
}

export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error("Файл не вибрано"));
            return;
        }

        const reader = new FileReader();
        reader.onload = event => resolve(event.target?.result || "");
        reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
        reader.readAsDataURL(file);
    });
}

