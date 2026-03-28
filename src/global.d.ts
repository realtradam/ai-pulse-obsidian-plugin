import type _moment from "moment";

declare global {
	interface Window {
		moment: typeof _moment;
	}
}
