import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render default UI with required elements', async ({ page }) => {
    // Verify header elements
    await expect(page.getByText('PromptToVideo').first()).toBeVisible();
    await expect(page.getByText('AI Storytelling Studio').first()).toBeVisible();

    // Verify input placeholder
    await expect(page.getByPlaceholder('Describe your story idea here...')).toBeVisible();

    // Verify buttons exist
    const resetButton = page.getByRole('button', { name: 'Reset', exact: true });
    await expect(resetButton).toBeVisible();
    
    const createStoryButton = page.getByRole('button', { name: 'Create Story', exact: true });
    await expect(createStoryButton).toBeVisible();

    // Verify initial state - no scenes yet
    await expect(page.locator('.scene-card')).toHaveCount(0);
  });

  test('should handle prompt input and reset functionality', async ({ page }) => {
    const textarea = page.getByPlaceholder('Describe your story idea here...');
    
    // Verify default prompt value
    await expect(textarea).toHaveValue("A journey of innovation and unity");

    // Test typing new prompt
    await textarea.fill("My amazing adventure");
    await expect(textarea).toHaveValue("My amazing adventure");

    // Click reset button and verify it resets to default
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(textarea).toHaveValue("A journey of innovation and unity");
  });

  test('should generate story scenes when Create Story is clicked', async ({ page }) => {
    // Click the create story button
    const createButton = page.getByRole('button', { name: 'Create Story', exact: true });
    
    // Ensure it's enabled first
    await expect(createButton).toBeEnabled();
    
    // Start the generation process
    const generatePromise = page.waitForResponse('**/api/text-to-speech');
    await createButton.click();

    // Wait for the API response to complete
    await generatePromise;

    // Verify generating state (button changes text)
    await expect(page.getByRole('button', { name: 'Creating...', exact: true })).toBeVisible();
    
    // Wait for scenes to be generated - should have multiple scene cards after generation
    await page.waitForSelector('.scene-card', { timeout: 30000 });
    
    // Verify scenes were created (story arc has 10+ nodes)
    const sceneCards = page.locator('.scene-card');
    await expect(sceneCards).toHaveCount(10); // 2 setup + 3 conflict + 2 climax + 3 resolution
    
    // Verify at least some scenes have character names visible
    const firstSceneCharacter = page.getByText('Narrator').first();
    await expect(firstSceneCharacter).toBeVisible();
  });

  test('should handle story playback with audio and image display', async ({ page }) => {
    // Generate a story first
    await page.getByRole('button', { name: 'Create Story', exact: true }).click();
    await page.waitForResponse('**/api/text-to-speech');
    
    // Wait for scenes to be generated
    await page.waitForSelector('.scene-card', { timeout: 30000 });
    
    // Click play button
    const playButton = page.getByRole('button', { name: 'Play Story', exact: true });
    await expect(playButton).toBeVisible();
    await playButton.click();

    // Verify playing state (button should change to pause)
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // Verify first scene is displayed with image container
    const videoContainer = page.locator('.relative.aspect-video');
    await expect(videoContainer).toBeVisible();
    
    // Check that the image element has a valid src (either generated or placeholder)
    const imgElement = videoContainer.locator('img').first();
    await expect(imgElement).toBeVisible();
    await expect(imgElement).toHaveAttribute('src', /^data:|^http|^\//);
  });

  test('should show loading state during scene generation', async ({ page }) => {
    // Click create and watch for loading states
    const createButton = page.getByRole('button', { name: 'Create Story', exact: true });
    
    await createButton.click();
    
    // Verify creating... state appears immediately
    await expect(page.getByText('Creating...', { exact: true })).toBeVisible();

    // Wait for generation to complete (spinner disappears)
    await page.waitForSelector('.scene-card', { timeout: 30000 });

    // Verify loading spinner is gone
    const spinners = page.locator('svg.w-12.h-12.text-indigo-500.animate-spin');
    await expect(spinners).toHaveCount(0);
    
    // Verify at least one scene has an image
    const images = page.locator('.relative.aspect-video img');
    await expect(images.first()).toBeVisible();
  });

  test('should support re-generation after initial generation', async ({ page }) => {
    // Generate first story
    await page.getByRole('button', { name: 'Create Story', exact: true }).click();
    await page.waitForResponse('**/api/text-to-speech');
    await page.waitForSelector('.scene-card', { timeout: 30000 });
    
    const initialSceneCount = await page.locator('.scene-card').count();
    expect(initialSceneCount).toBeGreaterThan(0);

    // Clear prompt and generate again
    await page.getByPlaceholder('Describe your story idea here...').fill("New story concept");
    await page.getByRole('button', { name: 'Create Story', exact: true }).click();
    await page.waitForResponse('**/api/text-to-speech');
    
    // Wait for new scenes to generate
    await page.waitForSelector('.scene-card', { timeout: 30000 });
    
    const newSceneCount = await page.locator('.scene-card').count();
    expect(newSceneCount).toBeGreaterThan(0);
    
    // Verify the content changed (narrator dialogue should be different)
    await expect(page.getByText('Narrator').first()).toBeVisible();
  });

  test('should work correctly in mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Verify core elements are visible on mobile
    await expect(page.getByText('PromptToVideo').first()).toBeVisible();
    await expect(page.getByPlaceholder('Describe your story idea here...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Story', exact: true })).toBeVisible();

    // Test generation flow works on mobile
    await page.getByRole('button', { name: 'Create Story', exact: true }).click();
    await page.waitForResponse('**/api/text-to-speech');
    await page.waitForSelector('.scene-card', { timeout: 30000 });
    
    const sceneCards = page.locator('.scene-card');
    await expect(sceneCards).toHaveCount(10);
  });

  test('should show proper state when no prompt is provided for generation', async ({ page }) => {
    // Clear the prompt
    await page.getByPlaceholder('Describe your story idea here...').fill("");
    
    const createButton = page.getByRole('button', { name: 'Create Story', exact: true });
    
    // Verify button becomes disabled when no prompt
    await expect(createButton).toBeDisabled();
  });

  test('should display chat/system messages after generation', async ({ page }) => {
    // Generate story first
    await page.getByRole('button', { name: 'Create Story', exact: true }).click();
    await page.waitForResponse('**/api/text-to-speech');
    await page.waitForSelector('.scene-card', { timeout: 30000 });

    // Verify system message appears (from useEffect)
    await expect(page.getByText("Ready to generate your visual story. Enter a prompt to begin.").first()).toBeVisible();
    
    // After generation completes, verify completion message
    await expect(page.getByText("Story generated! Audio and images are ready for playback.").first()).toBeVisible();
  });
});