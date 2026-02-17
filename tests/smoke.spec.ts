import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the main page with correct title and structure', async ({ page }) => {
    // Verify main heading is visible
    await expect(page.getByRole('heading', { name: 'Visionary AI', exact: true })).toBeVisible();
    
    // Verify subtitle is present
    await expect(page.getByText('Prompt to Cinematic Scene').first()).toBeVisible();
    
    // Verify Scene Navigator heading exists
    await expect(page.getByRole('heading', { name: 'Scene Navigator', exact: true })).toBeVisible();
    
    // Verify input field exists with correct placeholder
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await expect(input).toBeVisible();
    
    // Verify Generate button exists
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
  });

  test('should show empty state in Scene Navigator', async ({ page }) => {
    // Verify the empty state message is visible
    await expect(page.getByText('No scenes generated yet').first()).toBeVisible();
  });

  test('should disable generate button when input is empty', async ({ page }) => {
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generateButton).toBeDisabled();
  });

  test('should enable generate button when input has text', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await input.fill('A mystical forest at dawn');
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generateButton).toBeEnabled();
  });

  test('should generate scenes and display results', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await input.fill('A mystical forest at dawn');
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await generateButton.click();
    
    // Wait for loading to complete - the generate button should become enabled again
    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    
    // Verify scenes are generated (should have 3 nodes)
    const sceneButtons = page.locator('.node-indicator');
    await expect(sceneButtons).toHaveCount(3);
    
    // Verify images are generated - check that images have valid src
    const sceneImage = page.locator('.aspect-video img');
    await expect(sceneImage).toBeVisible();
    await expect(sceneImage).toHaveAttribute('src', /^data:|^http|^\//);
    
    // Verify character names appear (Narrator, Hero, Sage)
    await expect(page.getByText('Narrator').first()).toBeVisible();
    await expect(page.getByText('Hero').first()).toBeVisible();
    await expect(page.getByText('Sage').first()).toBeVisible();
  });

  test('should navigate between generated scenes', async ({ page }) => {
    // Generate scenes first
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await input.fill('A mystical forest at dawn');
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await generateButton.click();
    
    // Wait for generation to complete
    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    
    // Click on second scene (Hero)
    const heroButton = page.locator('.node-indicator').nth(1);
    await heroButton.click();
    
    // Verify the character name changes to Hero
    await expect(page.getByText('Hero').first()).toBeVisible();
    
    // Navigate to third scene (Sage)
    const sageButton = page.locator('.node-indicator').nth(2);
    await sageButton.click();
    
    // Verify the character name changes to Sage
    await expect(page.getByText('Sage').first()).toBeVisible();
  });

  test('should toggle play/pause functionality', async ({ page }) => {
    // Generate scenes first
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await input.fill('A mystical forest at dawn');
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await generateButton.click();
    
    // Wait for generation to complete
    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    
    // Find and click the play button
    const playButton = page.locator('button').filter({ has: page.locator('svg.lucide-play') });
    await expect(playButton).toBeVisible();
    await playButton.click();
    
    // The button should now show pause icon (verify by checking for pause icon visibility)
    const pauseButton = page.locator('button').filter({ has: page.locator('svg.lucide-pause') });
    await expect(pauseButton).toBeVisible();
  });

  test('should toggle mute functionality', async ({ page }) => {
    // Find and click the mute button (volume-x icon)
    const muteButton = page.locator('button').filter({ has: page.locator('svg.lucide-volume-x') });
    await expect(muteButton).toBeVisible();
    await muteButton.click();
    
    // After clicking, should show volume-2 icon (unmuted)
    const volumeButton = page.locator('button').filter({ has: page.locator('svg.lucide-volume-2') });
    await expect(volumeButton).toBeVisible();
  });

  test('should regenerate scenes with new prompt', async ({ page }) => {
    // First generation
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await input.fill('A mystical forest at dawn');
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await generateButton.click();
    
    // Wait for first generation to complete
    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    
    // Verify first set of scenes
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Clear and generate new prompt
    await input.fill('An underwater kingdom');
    await generateButton.click();
    
    // Wait for second generation to complete
    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    
    // Verify scenes are regenerated - still 3 nodes
    const sceneButtons = page.locator('.node-indicator');
    await expect(sceneButtons).toHaveCount(3);
    
    // Verify characters still present after regeneration
    await expect(page.getByText('Narrator').first()).toBeVisible();
    await expect(page.getByText('Hero').first()).toBeVisible();
    await expect(page.getByText('Sage').first()).toBeVisible();
  });

  test('should display correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Verify main heading is still visible
    await expect(page.getByRole('heading', { name: 'Visionary AI', exact: true })).toBeVisible();
    
    // Verify Scene Navigator is visible on mobile
    await expect(page.getByRole('heading', { name: 'Scene Navigator', exact: true })).toBeVisible();
    
    // Verify input and button are accessible on mobile
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await expect(input).toBeVisible();
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generateButton).toBeVisible();
    
    // Test generation works on mobile
    await input.fill('A space station');
    await generateButton.click();
    
    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    
    // Verify scenes generate on mobile
    const sceneButtons = page.locator('.node-indicator');
    await expect(sceneButtons).toHaveCount(3);
  });
});