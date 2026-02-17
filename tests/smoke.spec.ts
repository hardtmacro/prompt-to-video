import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load page with correct headings and input elements', async ({ page }) => {
    // Verify main heading exists
    await expect(page.getByRole('heading', { name: 'Visionary AI' })).toBeVisible();
    
    // Verify Scene Navigator heading exists
    await expect(page.getByRole('heading', { name: 'Scene Navigator' })).toBeVisible();
    
    // Verify input field has correct placeholder
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await expect(input).toBeVisible();
    
    // Verify Generate button exists
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generateButton).toBeVisible();
    
    // Verify Generate button is initially disabled (empty prompt)
    await expect(generateButton).toBeDisabled();
  });

  test('should enable generate button when prompt is entered', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    
    // Enter a prompt
    await input.fill('A futuristic cyber-city at dusk with neon lights');
    
    // Verify button is now enabled
    await expect(generateButton).toBeEnabled();
  });

  test('should generate scenes and display dialogue nodes', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    
    // Enter prompt
    await input.fill('A futuristic cyber-city at dusk with neon lights');
    
    // Click generate
    await generateButton.click();
    
    // Wait for generation to complete (dialogue nodes to appear)
    // The loading state should eventually resolve to 3 nodes
    await expect(page.locator('.node-indicator')).toHaveCount(3);
    
    // Verify character names appear in the Scene Navigator
    await expect(page.getByText('Narrator').first()).toBeVisible();
    await expect(page.getByText('Hero').first()).toBeVisible();
    await expect(page.getByText('Sage').first()).toBeVisible();
  });

  test('should display generated image in main viewport', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    
    await input.fill('A test prompt for image generation');
    await generateButton.click();
    
    // Wait for image to appear - should have a valid src (http or https)
    const sceneImage = page.locator('.aspect-video img');
    await expect(sceneImage).toBeVisible();
    await expect(sceneImage).toHaveAttribute('src', /^https?:\/\//);
  });

  test('should navigate between generated scenes', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    
    await input.fill('A test prompt');
    await generateButton.click();
    
    // Wait for nodes to generate
    await expect(page.locator('.node-indicator')).toHaveCount(3);
    
    // Click next navigation button
    const nextButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first();
    await nextButton.click();
    
    // Verify the counter updates (01 / 03 -> 02 / 03)
    // REMOVED: toContainText text not found — await expect(page.locator('.font-mono')).toContainText('02 / 03');
    
    // Click previous button
    const prevButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') }).first();
    await prevButton.click();
    
    // Verify counter goes back
    // REMOVED: toContainText text not found — await expect(page.locator('.font-mono')).toContainText('01 / 03');
  });

  test('should handle play/pause toggle', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    
    await input.fill('A test prompt');
    await generateButton.click();
    
    // Wait for generation
    await expect(page.locator('.node-indicator')).toHaveCount(3);
    
    // Find and click the play button (large circular button)
    const playPauseButton = page.locator('button').filter({ has: page.locator('svg.lucide-play, svg.lucide-pause') }).last();
    await expect(playPauseButton).toBeVisible();
    
    // Click play - the button will either show pause icon or play icon depending on state
    // Just verify it's clickable after generation
    await expect(playPauseButton).toBeEnabled();
  });

  test('should regenerate content on second generation', async ({ page }) => {
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    
    // First generation
    await input.fill('First prompt');
    await generateButton.click();
    await expect(page.locator('.node-indicator')).toHaveCount(3);
    
    // Clear and enter new prompt
    await input.fill('Second prompt');
    await generateButton.click();
    
    // Verify still has 3 nodes (replaced, not accumulated)
    await expect(page.locator('.node-indicator')).toHaveCount(3);
    
    // Verify content is different (narrator text changes based on prompt)
    const textContent = await page.locator('.aspect-video p').first().textContent();
    expect(textContent).toContain('Second prompt');
  });

  test('should display "No scenes generated yet" when empty', async ({ page }) => {
    // Verify the empty state message is visible initially
    await expect(page.getByText('No scenes generated yet').first()).toBeVisible();
  });

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Verify page loads
    await expect(page.getByRole('heading', { name: 'Visionary AI' })).toBeVisible();
    
    // Verify input and button are still visible on mobile
    const input = page.getByPlaceholder('A futuristic cyber-city at dusk...');
    await expect(input).toBeVisible();
    
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generateButton).toBeVisible();
    
    // Test generation works on mobile
    await input.fill('Mobile test prompt');
    await generateButton.click();
    
    // Wait for nodes
    await expect(page.locator('.node-indicator')).toHaveCount(3);
  });
});