import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLibraryQuery } from "../../client";
import { Card } from "../../components/primitive";
import { DevicesGroup, LocationsGroup, VolumesGroup } from "./components";

// Animation config for smooth transitions
const timingConfig = {
	duration: 200,
	easing: Easing.out(Easing.cubic),
};

interface Space {
	id: string;
	name: string;
	color: string;
}

function SpaceSwitcher({
	spaces,
	currentSpace,
	onSelectSpace,
}: {
	spaces: Space[] | undefined;
	currentSpace: Space | undefined;
	onSelectSpace: (space: Space) => void;
}) {
	const [showDropdown, setShowDropdown] = useState(false);

	const handleSelectSpace = useCallback(
		(space: Space) => {
			onSelectSpace(space);
			setShowDropdown(false);
		},
		[onSelectSpace]
	);

	return (
		<View className="mb-6">
			{currentSpace && (
				<Pressable onPress={() => setShowDropdown(!showDropdown)}>
					<View className="flex-row items-center gap-2">
						<View
							className="w-4 h-4 mx-1 rounded-full"
							style={{ backgroundColor: currentSpace.color }}
						/>
						<Text className="text-ink text-[30px] font-bold">
							{currentSpace.name}
						</Text>
					</View>
				</Pressable>
			)}

			{showDropdown && spaces && spaces.length > 0 && (
				<Card className="mt-2">
					{spaces.map((space) => (
						<Pressable
							key={space.id}
							className={`flex-row items-center gap-2 py-2 px-2 rounded ${
								currentSpace?.id === space.id ? "bg-app-hover" : ""
							}`}
							onPress={() => handleSelectSpace(space)}
						>
							<View
								className="w-2 h-2 rounded-full"
								style={{ backgroundColor: space.color }}
							/>
							<Text className="text-ink text-sm flex-1">
								{space.name}
							</Text>
							{currentSpace?.id === space.id && (
								<Text className="text-accent text-xs">✓</Text>
							)}
						</Pressable>
					))}
				</Card>
			)}
		</View>
	);
}

export function BrowseScreen() {
	const insets = useSafeAreaInsets();
	const { data: spacesData } = useLibraryQuery("spaces.list", {});
	const spaces = (spacesData as { spaces?: Space[] })?.spaces;
	const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

	// Default to first space if none selected
	const currentSpace =
		spaces?.find((s) => s.id === selectedSpaceId) ||
		(spaces && spaces.length > 0 ? spaces[0] : undefined);

	const handleSelectSpace = useCallback((space: Space) => {
		setSelectedSpaceId(space.id);
	}, []);

	return (
		<View className="flex-1 bg-app">
			<ScrollView
				contentContainerStyle={{
					paddingTop: insets.top + 16,
					paddingHorizontal: 16,
					paddingBottom: insets.bottom + 60,
				}}
				showsVerticalScrollIndicator={false}
			>
				{/* Space Switcher */}
				<SpaceSwitcher
					spaces={spaces}
					currentSpace={currentSpace}
					onSelectSpace={handleSelectSpace}
				/>

				{/* Locations */}
				<LocationsGroup />

				{/* Devices */}
				<DevicesGroup />

				{/* Volumes */}
				<VolumesGroup />
			</ScrollView>
		</View>
	);
}
