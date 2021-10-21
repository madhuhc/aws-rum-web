import { RecordEvent, Plugin, PluginContext } from '../Plugin';
import { DomEvent } from '../../events/dom-event';
import { DOM_EVENT_TYPE } from '../utils/constant';

export const DOM_EVENT_PLUGIN_ID = 'com.amazonaws.rum.dom-event';

export type TargetDomEvent = {
    /**
     * DOM event type (e.g., click, scroll, hover, etc.)
     */
    event: string;

    /**
     * DOM element ID.
     */
    elementId?: string;

    /**
     * DOM element
     */
    element?: HTMLElement;
};

export class DomEventPlugin implements Plugin {
    private recordEvent: RecordEvent | undefined;
    private configuration: TargetDomEvent[] = [];
    private pluginId: string;
    private eventListenerMap: Map<TargetDomEvent, EventListener>;
    private enabled: boolean;

    constructor() {
        this.pluginId = DOM_EVENT_PLUGIN_ID;
        this.eventListenerMap = new Map<TargetDomEvent, EventListener>();
        this.enabled = true;
    }

    load(context: PluginContext): void {
        this.recordEvent = context.record;
    }

    enable(): void {
        if (this.enabled) {
            return;
        }
        this.addListeners(this.configuration);
        this.enabled = true;
    }

    disable(): void {
        if (!this.enabled) {
            return;
        }
        this.removeListeners(this.configuration);
        this.enabled = false;
    }

    getPluginId(): string {
        return this.pluginId;
    }

    configure(config: any): void {
        if (this.enabled) {
            this.removeListeners(this.configuration);
            this.addListeners(config);
        }
        this.configuration = config;
    }

    private removeListeners(config: TargetDomEvent[]) {
        config.forEach((domEvent) => this.removeEventHandler(domEvent));
    }

    private addListeners(config: TargetDomEvent[]) {
        config.forEach((domEvent) => this.addEventHandler(domEvent));
    }

    private getEventListener(): EventListener {
        return (event: Event): void => {
            // @ts-ignore
            const eventData: DomEvent = {
                version: '1.0.0',
                event: event.type,
                elementId: this.getElementId(event)
            };
            if (this.recordEvent) {
                this.recordEvent(DOM_EVENT_TYPE, eventData);
            }
        };
    }

    private getElementId(event: Event) {
        if (!event.target) {
            return '';
        }

        if (event.target instanceof Element && event.target.id) {
            return event.target.id;
        }

        if (event.target instanceof Node) {
            return event.target.nodeName;
        }

        return '';
    }

    private addEventHandler(domEvent: TargetDomEvent): void {
        const eventType = domEvent.event;
        const eventListener = this.getEventListener();
        this.eventListenerMap.set(domEvent, eventListener);

        if (domEvent.elementId) {
            document
                .getElementById(domEvent.elementId)
                ?.addEventListener(eventType, eventListener);
        } else if (domEvent.element) {
            domEvent.element.addEventListener(eventType, eventListener);
        }
    }

    private removeEventHandler(domEvent: TargetDomEvent): void {
        const eventListener:
            | EventListener
            | undefined = this.eventListenerMap.get(domEvent);

        if (domEvent.elementId && eventListener) {
            const element = document.getElementById(domEvent.elementId);
            if (element) {
                element.removeEventListener(domEvent.event, eventListener);
            }
        } else if (domEvent.element && eventListener) {
            domEvent.element.removeEventListener(domEvent.event, eventListener);
        }
        this.eventListenerMap.delete(domEvent);
    }
}