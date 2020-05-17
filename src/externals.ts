import {Service} from "./service";

export let service: Service;

export const dependencies = ["ipc", "reader"];

export function start([ipc, reader]: any[]): Promise<void> {
    service = new Service(ipc, reader);
    return Promise.resolve();
}