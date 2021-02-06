import {Definition as MenuDefinition} from "./menu";
import {Definition as SimilarsDefinition} from "./similars";
import {Service} from "./service";

export {namespace} from "./constant";

export const stylesheets = [
    new URL("extension://index.css"),
];

export const menus = [
    MenuDefinition,
];

export const extras = [
    SimilarsDefinition,
];

export const services = [
    Service,
];