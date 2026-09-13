import { Extension } from '@tiptap/core'

export const CustomTable = Extension.create({
    name: 'CustomTable',

    addGlobalAttributes() {
        return [
            {
                // Sadece 'table' düğümlerine bu özellikleri ekle
                types: ['table'],
                attributes: {
                    borderWidth: {
                        default: '1',
                        parseHTML: element => element.style.getPropertyValue('--table-border-width')?.replace('px', '') || '1',
                        renderHTML: attributes => {
                            const bw = attributes.borderWidth != null ? String(attributes.borderWidth) : '1'
                            const bs = attributes.borderStyle != null ? String(attributes.borderStyle) : 'solid'
                            return { style: `--table-border-width: ${bw}px; --table-border-style: ${bs};` }
                        }
                    },
                    borderStyle: {
                        default: 'solid',
                        parseHTML: element => element.style.getPropertyValue('--table-border-style') || 'solid',
                        renderHTML: () => ({}),
                    },
                    // Tablonun tam sayfa başlaması için stil enjeksiyonu
                    widthOverride: {
                        default: '100%',
                        renderHTML: () => {
                            return { style: 'width: 100%; min-width: 100%;' }
                        }
                    }
                }
            }
        ]
    }
})