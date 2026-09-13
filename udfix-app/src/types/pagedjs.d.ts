declare module 'pagedjs' {
    export class Previewer {
        preview(content: string | Element, stylesheets: string[], container: HTMLElement): Promise<unknown>;
    }
}
