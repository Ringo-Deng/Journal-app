/** Electron does not implement window.prompt; keep browser behavior unchanged. */
export function promptLayerName(title: string, initial: string): Promise<string | null> {
  if (!window.shiguangDesktop) return Promise.resolve(window.prompt(title, initial));
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'desktop-name-dialog';
    dialog.style.cssText = 'border:1px solid #d5d4ca;border-radius:12px;padding:24px;min-width:300px;background:#f6f2eb;color:#384237;font:inherit';
    const form = document.createElement('form');
    form.method = 'dialog';
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.value = initial;
    input.maxLength = 40;
    input.style.cssText = 'display:block;margin:12px 0 20px;width:100%;padding:8px;font:inherit';
    label.append(input);
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = '取消';
    const save = document.createElement('button');
    save.type = 'submit'; save.textContent = '保存';
    save.style.marginLeft = '12px';
    let result: string | null = null;
    cancel.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', () => { result = input.value; });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
    form.append(label, cancel, save); dialog.append(form); document.body.append(dialog);
    dialog.showModal(); input.focus(); input.select();
  });
}
