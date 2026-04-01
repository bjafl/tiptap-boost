import { test, expect } from '@playwright/test'

const editorUrl = (config: Record<string, unknown> = {}) => {
  const params = new URLSearchParams({
    ext: 'pagination',
    config: JSON.stringify(config),
  })
  return `/?${params}`
}

test.describe('PaginationPlusPlus', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('BROWSER:', msg.text()))
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))
    await page.goto(editorUrl({ content: '<p>Hello</p>' }))
    // Wait for editor to be ready
    await page.waitForFunction(() => (window as any).__ready === true, null, {
      timeout: 10000,
    })
    await page.waitForSelector('.rm-with-pagination')
  })

  test('renders page decorations on load', async ({ page }) => {
    await expect(page.locator('#pages')).toBeAttached({ timeout: 3000 })
  })

  test('starts with at least one page break', async ({ page }) => {
    const pageBreaks = page.locator('.rm-page-break')
    const count = await pageBreaks.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('shows page number element in footer', async ({ page }) => {
    const pageNumber = page.locator('.rm-page-number')
    await expect(pageNumber.first()).toBeAttached({ timeout: 3000 })
  })

  test('adds pages when content overflows', async ({ page }) => {
    const initialCount = await page.locator('.rm-page-break').count()

    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.setContent('<p>Lorem ipsum dolor sit amet</p>'.repeat(200))
    })

    // Wait for pagination to recalculate
    await page.waitForFunction(
      (initial) => {
        const el = document.querySelector('[data-rm-pagination]')
        return el && el.children.length > initial
      },
      initialCount,
      { timeout: 5000 }
    )

    const newCount = await page.locator('.rm-page-break').count()
    expect(newCount).toBeGreaterThan(initialCount)
  })

  test('reduces pages when content is removed', async ({ page }) => {
    // Fill with content first
    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.setContent('<p>Lorem ipsum dolor sit amet</p>'.repeat(200))
    })
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-rm-pagination]')
        return el && el.children.length > 2
      },
      null,
      { timeout: 5000 }
    )

    const fullCount = await page.locator('.rm-page-break').count()

    // Remove most content
    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.setContent('<p>Short</p>')
    })
    await page.waitForFunction(
      (full) => {
        const el = document.querySelector('[data-rm-pagination]')
        return el && el.children.length < full
      },
      fullCount,
      { timeout: 5000 }
    )

    const reducedCount = await page.locator('.rm-page-break').count()
    expect(reducedCount).toBeLessThan(fullCount)
  })

  test('updatePageSize command changes CSS variable', async ({ page }) => {
    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.updatePageSize({
        pageHeight: 1591,
        pageWidth: 1123,
        marginTop: 95,
        marginBottom: 95,
        marginLeft: 76,
        marginRight: 76,
      })
    })

    await page.waitForFunction(
      () => {
        const el = document.querySelector('.rm-with-pagination') as HTMLElement
        const width = el?.style.getPropertyValue('--rm-page-width').trim()
        console.log('Page width CSS variable:', width)
        return width === '1123px' || Number(width) === 1123
      },
      null,
      { timeout: 3000 }
    )

    const width = await page
      .locator('.rm-with-pagination')
      .evaluate((el: HTMLElement) => el.style.getPropertyValue('--rm-page-width'))
    console.log('Page width CSS variable:', width)
    expect(width).toBe('1123px')
  })

  test('updateMargins command updates CSS variables', async ({ page }) => {
    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.updateMargins({
        top: 50,
        bottom: 60,
        left: 40,
        right: 40,
      })
    })

    await page.waitForFunction(
      () => {
        const el = document.querySelector('.rm-with-pagination') as HTMLElement
        return el?.style.getPropertyValue('--rm-margin-top') === '50px'
      },
      null,
      { timeout: 3000 }
    )

    const el = page.locator('.rm-with-pagination')
    expect(await el.evaluate((e: HTMLElement) => e.style.getPropertyValue('--rm-margin-top'))).toBe(
      '50px'
    )
    expect(
      await el.evaluate((e: HTMLElement) => e.style.getPropertyValue('--rm-margin-bottom'))
    ).toBe('60px')
    expect(
      await el.evaluate((e: HTMLElement) => e.style.getPropertyValue('--rm-margin-left'))
    ).toBe('40px')
  })

  test('custom header renders for specific page', async ({ page }) => {
    // Fill enough content for multiple pages
    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.setContent('<p>Lorem ipsum</p>'.repeat(200))
    })
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-rm-pagination]')
        return el && el.children.length > 2
      },
      null,
      { timeout: 5000 }
    )

    // Set custom header for page 2
    await page.evaluate(() => {
      const editor = (window as any).__editor
      editor.commands.updateHeaderContent('Custom Left', 'Custom Right', 2)
    })

    // Trigger re-render
    await page.waitForFunction(
      () => {
        return document.querySelector('.rm-page-header-2') !== null
      },
      null,
      { timeout: 5000 }
    )

    await expect(page.locator('.rm-page-header-2')).toBeAttached()
  })
})
