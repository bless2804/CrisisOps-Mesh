import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type Toast = { id: string; text: string };
type Ctx = { push: (text: string) => void };

const ToastCtx = createContext<Ctx>({ push: () => { } });

export function useToast() {
    return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<Toast[]>([]);
    const push = useCallback((text: string) => {
        const id = crypto.randomUUID();
        setItems((prev) => [...prev, { id, text }]);
        setTimeout(() => setItems((prev) => prev.filter(t => t.id !== id)), 2200);
    }, []);

    return (
        <ToastCtx.Provider value={{ push }}>
            {children}
            <div className="fixed top-3 right-3 z-[1000] space-y-2">
                {items.map(t => (
                    <div key={t.id} className="px-3 py-2 rounded-lg shadow border bg-white/95 backdrop-blur text-sm">
                        {t.text}
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}
