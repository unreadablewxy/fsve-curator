interface Listener {
    onAssignment(identifier: string, value: string): void;
    onSectionEnd(): void;
}

type Parser = ((line: string) => void) & {
    with(sectionName: string, listener: Listener): Parser;
};

export function createParser(): Parser {
    const listeners = new Map<string, Listener>();
    let section = "";
    let listener: Listener | undefined;

    function result(line: string): void {
        if (!line) return;

        if (line.startsWith('[') || line === "\0") {
            if (listener)
                listener.onSectionEnd();

            section = line.slice(1, line.length - 1);
            listener = listeners.get(section);
        } else if (listener) {
            const assignment = line.indexOf("=");
            if (assignment < 1)
                return;

            const variable = line.slice(0, assignment).trim();
            const value = line.slice(assignment + 1).trim();

            listener.onAssignment(variable, value);
        }
    }

    result.with = function(section: string, listener: Listener) {
        listeners.set(section,listener);
        return this;
    };

    return result as Parser;
}