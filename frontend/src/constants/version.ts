/**
 * Biến phiên bản ứng dụng được tự động lấy từ nguồn gốc duy nhất: version.json
 */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "3.10.4";
export const APP_VERSION_LABEL = `Version: ${APP_VERSION}`;

