import React, { useState, useRef, useCallback } from "react";
import {
	View,
	Text,
	ScrollView,
	Dimensions,
	NativeScrollEvent,
	NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	useAnimatedStyle,
	withTiming,
	Easing,
} from "react-native-reanimated";
import { useNormalizedQuery } from "../../client";
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

const SCREEN_WIDTH = Dimensions.get("window").width;

// Animated indicator dot for space pagination
function IndicatorDot({
	isActive,
	color,
}: {
	isActive: boolean;
	color: string;
}) {
	const animatedStyle = useAnimatedStyle(() => ({
		width: withTiming(isActive ? 24 : 8, timingConfig),
		opacity: withTiming(isActive ? 1 : 0.3, timingConfig),
		backgroundColor: color,
	}));

	return (
		<Animated.View
			style={[
				{
					height: 8,
					borderRadius: 4,
				},
				animatedStyle,
			]}
		/>
	);
}

function SpaceIndicator({
	spaces,
	currentIndex,
	totalPages,
}: {
	spaces: Space[];
	currentIndex: number;
	totalPages: number;
}) {
	return (
		<View className="flex-row justify-center gap-2 mb-4">
			{Array.from({ length: totalPages }).map((_, index) => {
				const isCreatePage = index === totalPages - 1;
				const space = !isCreatePage ? spaces[index] : null;
				const isActive = currentIndex === index;
				const color = isCreatePage
					? isActive
						? "hsl(235, 70%, 55%)"
						: "hsl(235, 15%, 30%)"
					: space?.color || "hsl(235, 15%, 30%)";

				return <IndicatorDot key={index} isActive={isActive} color={color} />;
			})}
		</View>
	);
}

function SpaceContent({ space, insets }: { space: Space; insets: any }) {
	return (
		<ScrollView
			style={{ width: SCREEN_WIDTH }}
			contentContainerStyle={{
				paddingTop: insets.top + 80,
				paddingHorizontal: 16,
				paddingBottom: insets.bottom + 100,
			}}
			showsVerticalScrollIndicator={false}
		>
			{/* Header */}
			<View className="mb-6">
				<View className="flex-row items-center gap-2 mb-1">
					<View
						className="w-3 h-3 rounded-full"
						style={{ backgroundColor: space.color }}
					/>
					<Text className="text-2xl font-bold text-ink">{space.name}</Text>
				</View>
				<Text className="text-ink-dull text-sm">
					Your libraries and spaces
				</Text>
			</View>

			{/* Locations */}
			<LocationsGroup />

			{/* Devices */}
			<DevicesGroup />

			{/* Volumes */}
			<VolumesGroup />
		</ScrollView>
	);
}

function CreateSpaceScreen() {
	return (
		<View
			style={{ width: SCREEN_WIDTH, paddingHorizontal: 16 }}
			className="flex-1 items-center justify-center"
		>
			<View className="w-16 h-16 rounded-full bg-accent/10 items-center justify-center mb-4">
				<Text className="text-accent text-3xl">+</Text>
			</View>
			<Text className="text-xl font-bold text-ink mb-2">
				Create New Space
			</Text>
			<Text className="text-ink-dull text-center max-w-xs">
				Organize your files, devices, and locations into separate spaces
			</Text>
		</View>
	);
}

export function BrowseScreen() {
	const insets = useSafeAreaInsets();
	const { data: spacesData } = useNormalizedQuery({
		wireMethod: "query:spaces.list",
		input: null,
		resourceType: "space",
	});
	const [currentPage, setCurrentPage] = useState(0);
	const scrollViewRef = useRef<ScrollView>(null);

	const spacesList = (spacesData?.spaces || []) as Space[];
	const totalPages = spacesList.length + 1; // +1 for create space page

	const handleScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const offsetX = event.nativeEvent.contentOffset.x;
			const page = Math.round(offsetX / SCREEN_WIDTH);
			setCurrentPage(page);
		},
		[]
	);

	return (
		<View className="flex-1 bg-app">
			<ScrollView
				ref={scrollViewRef}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={handleScroll}
				scrollEventThrottle={16}
				decelerationRate="fast"
			>
				{spacesList.map((space) => (
					<SpaceContent key={space.id} space={space} insets={insets} />
				))}
				<CreateSpaceScreen />
			</ScrollView>

			{/* Floating Space Indicator */}
			<View
				className="absolute left-0 right-0"
				style={{
					top: insets.top + 16,
				}}
				pointerEvents="none"
			>
				<SpaceIndicator
					spaces={spacesList}
					currentIndex={currentPage}
					totalPages={totalPages}
				/>
			</View>
		</View>
	);
}
