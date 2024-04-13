# Playwright Arduino

Mocks the WebSerial API to test Arduino Uploaders Playwright

## Usage

Install the package with `yarn add -D @leaphy-robotics/playwright-arduino` or using NPM `npm i --save-dev @leaphy-robotics/playwright-arduino`.

```js
import { test, expect } from '@playwright/test';
import setup from '@leaphy-robotics/playwright-arduino';

test('test', async ({ page }) => {
    await setup(page);
    
    // Your test code
    ...
});
```

## Development

### Building simulator
This step is required to be performed at least once `yarn build:simavr`

### Watching package
You can watch for changes and automatically recompile the NPM Module using `yarn watch`

### Using local package
Link the module using `yarn link`, now use it in your (test) project using `yarn link @leaphy-robotics/playwright-arduino`
