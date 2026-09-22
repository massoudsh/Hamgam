import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderHubFilters } from "@/components/OrderHubFilters";

describe("OrderHubFilters", () => {
  it("calls onChange with the selected channel", () => {
    const onChange = vi.fn();
    render(<OrderHubFilters value={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("فیلتر کانال"), { target: { value: "woocommerce" } });
    expect(onChange).toHaveBeenCalledWith({ channel: "woocommerce" });
  });

  it("calls onChange with the selected status", () => {
    const onChange = vi.fn();
    render(<OrderHubFilters value={{ channel: "basalam" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("فیلتر وضعیت"), { target: { value: "shipped" } });
    expect(onChange).toHaveBeenCalledWith({ channel: "basalam", status: "shipped" });
  });
});
