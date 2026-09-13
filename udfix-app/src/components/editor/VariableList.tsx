import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

type VariableListProps = {
    items: string[];
    command: (item: { id: string }) => void;
};

export default forwardRef(function VariableList(props: VariableListProps, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    const selectItem = (index: number) => {
        const item = props.items[index]

        if (item) {
            props.command({ id: item })
        }
    }

    const upHandler = () => {
        setSelectedIndex(((selectedIndex + props.items.length) - 1) % props.items.length)
    }

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
    }

    const enterHandler = () => {
        selectItem(selectedIndex)
    }

    useEffect(() => setSelectedIndex(0), [props.items])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                upHandler()
                return true
            }

            if (event.key === 'ArrowDown') {
                downHandler()
                return true
            }

            if (event.key === 'Enter') {
                enterHandler()
                return true
            }

            return false
        },
    }))

    return (
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[200px]">
            {props.items.length ? (
                props.items.map((item: string, index: number) => (
                    <button
                        className={`block w-full text-left px-4 py-2 text-sm ${index === selectedIndex ? 'bg-blue-100 text-blue-800' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        key={index}
                        onClick={() => selectItem(index)}
                    >
                        {item}
                    </button>
                ))
            ) : (
                <div className="px-4 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
            )}
        </div>
    )
})
